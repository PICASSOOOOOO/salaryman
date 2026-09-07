extends Node3D

## Godot presentation/input client for the authoritative Pygame office.
##
## Pygame owns movement, rooms, doors, workers, finance, and persistence.
## This client only turns snapshots into a 3D view and sends validated commands
## over the existing newline-delimited localhost protocol.

const PROTOCOL_VERSION := 1
const HOST := "127.0.0.1"
const PORT := 4242
const WORLD_SCALE := 0.01
const FLOOR_HEIGHT := 0.08
const WALL_HEIGHT := 1.65
const CAMERA_DISTANCE_MIN := 8.0
const CAMERA_DISTANCE_MAX := 22.0
const CAMERA_ORTHO_SIZE_MIN := 9.0
const CAMERA_ORTHO_SIZE_MAX := 18.0
const CAMERA_ORTHO_SIZE_BASE := 13.0

var connection := StreamPeerTCP.new()
var receive_buffer := ""
var snapshot: Dictionary = {}
var connection_status := "connecting to Pygame…"
var command_sequence := 0
var visual_player_world := Vector3(0.0, 0.45, 0.0)
var visual_player_ready := false
var target_player_world := Vector3.ZERO
var animation_clock := 0.0
var camera_distance := 14.0
var last_room_id := ""
var last_sequence := -1
var lobby_light: OmniLight3D
var rim_light: OmniLight3D
var interaction_rings: Array[MeshInstance3D] = []

var world_root: Node3D
var dynamic_root: Node3D
var player_root: Node3D
var camera: Camera3D
var status_label: Label
var room_label: Label
var mission_label: Label
var notice_label: Label
var camera_target := Vector3.ZERO

var materials: Dictionary = {}
var imported_scenes: Dictionary = {}


func _ready() -> void:
	_build_materials()
	_build_lighting()
	_build_building_shell()
	_build_static_furniture()
	_build_interface()
	_load_player()
	_connect_to_pygame()


func _build_materials() -> void:
	materials["floor"] = _material(Color("#d4b98b"), 0.92)
	materials["hall_floor"] = _material(Color("#7998a8"), 0.84)
	materials["lobby_floor"] = _material(Color("#3b9990"), 0.72)
	materials["office_1"] = _material(Color("#8f6e8f"), 0.82)
	materials["office_2"] = _material(Color("#3e8790"), 0.82)
	materials["office_3"] = _material(Color("#60759e"), 0.82)
	materials["office_4"] = _material(Color("#ad7890"), 0.82)
	materials["wall"] = _material(Color("#173239"), 0.78)
	materials["wall_trim"] = _material(Color("#2f8f82"), 0.62)
	materials["door"] = _material(Color("#e8b45d"), 0.66)
	materials["glass"] = _material(Color("#8ed6d2"), 0.18, true)
	materials["metal"] = _material(Color("#52676d"), 0.36, false, 0.28)
	materials["marker"] = _material(Color("#f8b957"), 0.34, true, 0.0, Color("#f8b957"))
	materials["signal"] = _material(Color("#71e0c0"), 0.3, true, 0.0, Color("#71e0c0"))


func _material(
	color: Color,
	roughness: float,
	transparent := false,
	metallic := 0.0,
	emission := Color(0.0, 0.0, 0.0, 0.0),
) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = roughness
	material.metallic = metallic
	material.specular_mode = BaseMaterial3D.SPECULAR_SCHLICK_GGX
	if emission.a > 0.0:
		material.emission_enabled = true
		material.emission = emission
		material.emission_energy_multiplier = 1.8
	if transparent:
		material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		material.shading_mode = BaseMaterial3D.SHADING_MODE_PER_PIXEL
	return material


func _build_lighting() -> void:
	var environment := WorldEnvironment.new()
	var environment_data := Environment.new()
	environment_data.background_mode = Environment.BG_COLOR
	environment_data.background_color = Color("#08191e")
	environment_data.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment_data.ambient_light_color = Color("#b9d4ce")
	environment_data.ambient_light_energy = 0.72
	environment_data.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	environment.environment = environment_data
	add_child(environment)

	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-52.0, -32.0, 0.0)
	sun.light_color = Color("#ffe4b0")
	sun.light_energy = 1.25
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 80.0
	add_child(sun)

	lobby_light = OmniLight3D.new()
	lobby_light.position = Vector3(10.0, 4.5, 15.0)
	lobby_light.light_color = Color("#7ee0c5")
	lobby_light.light_energy = 2.2
	lobby_light.omni_range = 13.0
	lobby_light.shadow_enabled = true
	add_child(lobby_light)

	rim_light = OmniLight3D.new()
	rim_light.position = Vector3(-7.0, 5.5, -5.0)
	rim_light.light_color = Color("#68b8ff")
	rim_light.light_energy = 1.35
	rim_light.omni_range = 19.0
	rim_light.shadow_enabled = true
	add_child(rim_light)


func _build_building_shell() -> void:
	world_root = Node3D.new()
	world_root.name = "ShadowTowerFloor01"
	add_child(world_root)

	dynamic_root = Node3D.new()
	dynamic_root.name = "BridgeObjects"
	world_root.add_child(dynamic_root)

	var floor_plan := _load_floor_plan()
	var room_specs: Array = []
	for room_data in floor_plan["rooms"]:
		var bounds: Array = room_data["bounds"]
		room_specs.append({
			"id": room_data["id"],
			"label": room_data["label"],
			"rect": Rect2(bounds[0], bounds[1], bounds[2], bounds[3]),
			"material": room_data["material"],
		})
	for spec in room_specs:
		_add_room_shell(spec, floor_plan)

	# A readable central circulation spine makes the building topology visible
	# even when no snapshot has arrived yet.
	_add_box("LobbyElevator", Vector3(18.0, 0.95, 30.0), Vector3(1.8, 1.9, 1.2), materials["metal"])
	_add_box("HallwayElevator", Vector3(11.0, 0.95, 41.0), Vector3(1.8, 1.9, 1.2), materials["metal"])
	_add_box("LobbyDesk", Vector3(11.5, 0.5, 22.2), Vector3(3.7, 1.0, 0.9), materials["metal"])


func _load_floor_plan() -> Dictionary:
	var raw := FileAccess.get_file_as_string("res://floor_plan.json")
	var parsed = JSON.parse_string(raw)
	if not parsed is Dictionary or not parsed.has("rooms"):
		push_error("floor_plan.json is missing or invalid")
		return {"rooms": [], "lobbyHallwayOpening": 1800, "officeDoorCenters": []}
	return parsed


func _add_room_shell(spec: Dictionary, floor_plan: Dictionary) -> void:
	var rect: Rect2 = spec["rect"]
	var room_id: String = spec["id"]
	var center := Vector3((rect.position.x + rect.size.x / 2.0) * WORLD_SCALE, FLOOR_HEIGHT, (rect.position.y + rect.size.y / 2.0) * WORLD_SCALE)
	var size := Vector3(rect.size.x * WORLD_SCALE, 0.16, rect.size.y * WORLD_SCALE)
	_add_box("%sFloor" % room_id, center, size, materials[spec["material"]])

	var left := rect.position.x * WORLD_SCALE
	var right := rect.end.x * WORLD_SCALE
	var top := rect.position.y * WORLD_SCALE
	var bottom := rect.end.y * WORLD_SCALE
	var wall_thickness := 0.26
	_add_box("%sWallLeft" % room_id, Vector3(left, WALL_HEIGHT / 2.0, (top + bottom) / 2.0), Vector3(wall_thickness, WALL_HEIGHT, rect.size.y * WORLD_SCALE), materials["wall"])
	_add_box("%sWallRight" % room_id, Vector3(right, WALL_HEIGHT / 2.0, (top + bottom) / 2.0), Vector3(wall_thickness, WALL_HEIGHT, rect.size.y * WORLD_SCALE), materials["wall"])

	if room_id == "recreation":
		var door_centers: Array = []
		for door_x in floor_plan["officeDoorCenters"]:
			door_centers.append(float(door_x) * WORLD_SCALE)
		_add_horizontal_wall_segments("%sWallBottom" % room_id, left, right, bottom, door_centers, 1.55)
	elif room_id == "lobby":
		_add_horizontal_wall_segments("%sWallBottom" % room_id, left, right, bottom, [float(floor_plan["lobbyHallwayOpening"]) * WORLD_SCALE], 1.8)
	elif room_id.begins_with("office") or room_id == "executive" or room_id == "public":
		_add_box("%sBackWall" % room_id, Vector3((left + right) / 2.0, WALL_HEIGHT / 2.0, bottom), Vector3(rect.size.x * WORLD_SCALE, WALL_HEIGHT, wall_thickness), materials["wall"])
		for door_x in [18.0, 39.0, 60.0, 81.0]:
			if door_x * WORLD_SCALE > left and door_x * WORLD_SCALE < right:
				_add_box("%sDoorLintel" % room_id, Vector3(door_x, WALL_HEIGHT - 0.18, top), Vector3(1.55, 0.36, wall_thickness + 0.04), materials["wall_trim"])
	else:
		_add_box("%sWallTop" % room_id, Vector3((left + right) / 2.0, WALL_HEIGHT / 2.0, top), Vector3(rect.size.x * WORLD_SCALE, WALL_HEIGHT, wall_thickness), materials["wall"])
		_add_box("%sWallBottom" % room_id, Vector3((left + right) / 2.0, WALL_HEIGHT / 2.0, bottom), Vector3(rect.size.x * WORLD_SCALE, WALL_HEIGHT, wall_thickness), materials["wall"])


func _add_horizontal_wall_segments(node_prefix: String, left: float, right: float, z: float, door_centers: Array, opening_width: float) -> void:
	var cursor := left
	for door_center in door_centers:
		var center := float(door_center)
		var opening_left := center - opening_width / 2.0
		var opening_right := center + opening_width / 2.0
		if opening_left > cursor:
			_add_box("%sSegment%d" % [node_prefix, int(cursor * 100.0)], Vector3((cursor + opening_left) / 2.0, WALL_HEIGHT / 2.0, z), Vector3(opening_left - cursor, WALL_HEIGHT, 0.26), materials["wall"])
		cursor = opening_right
	if cursor < right:
		_add_box("%sEnd" % node_prefix, Vector3((cursor + right) / 2.0, WALL_HEIGHT / 2.0, z), Vector3(right - cursor, WALL_HEIGHT, 0.26), materials["wall"])


func _build_static_furniture() -> void:
	imported_scenes["table"] = load("res://agentshire-assets/furniture/table_medium.gltf")
	imported_scenes["chair"] = load("res://agentshire-assets/furniture/chair_A.gltf")
	imported_scenes["couch"] = load("res://agentshire-assets/furniture/couch.gltf")
	imported_scenes["lamp"] = load("res://agentshire-assets/furniture/lamp_standing.gltf")

	_add_imported("LobbyCouch", "couch", Vector3(18.0, 0.0, 24.5), 1.25)
	_add_imported("LobbyLamp", "lamp", Vector3(27.0, 0.0, 18.5), 1.1)


func _add_imported(node_name: String, asset_name: String, position: Vector3, scale_value: float) -> void:
	var packed: PackedScene = imported_scenes.get(asset_name)
	if packed == null:
		return
	var instance := packed.instantiate()
	instance.name = node_name
	instance.position = position
	instance.scale = Vector3.ONE * scale_value
	world_root.add_child(instance)


func _add_box(node_name: String, position: Vector3, size: Vector3, material: Material) -> MeshInstance3D:
	var mesh := BoxMesh.new()
	mesh.size = size
	mesh.material = material
	var instance := MeshInstance3D.new()
	instance.name = node_name
	instance.mesh = mesh
	instance.position = position
	instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	world_root.add_child(instance)
	return instance


func _load_player() -> void:
	var player_scene: PackedScene = load("res://agentshire-assets/characters/character-male-a.glb")
	if player_scene:
		player_root = player_scene.instantiate()
		player_root.name = "AuthoritativePlayer"
		player_root.scale = Vector3.ONE * 1.15
		world_root.add_child(player_root)
	else:
		player_root = Node3D.new()
		player_root.name = "AuthoritativePlayer"
		world_root.add_child(player_root)
		var fallback_mesh := BoxMesh.new()
		fallback_mesh.size = Vector3(0.65, 1.5, 0.65)
		fallback_mesh.material = materials["door"]
		var fallback_instance := MeshInstance3D.new()
		fallback_instance.name = "PlayerFallback"
		fallback_instance.mesh = fallback_mesh
		fallback_instance.position = Vector3(0.0, 0.75, 0.0)
		player_root.add_child(fallback_instance)
	_set_player_animation("idle")


func _set_player_animation(animation_name: String) -> void:
	if player_root == null:
		return
	var animation_player := player_root.find_child("AnimationPlayer", true, false) as AnimationPlayer
	if animation_player == null or not animation_player.has_animation(animation_name):
		return
	if animation_player.current_animation != animation_name:
		animation_player.play(animation_name)


func _build_interface() -> void:
	var canvas := CanvasLayer.new()
	canvas.name = "HUD"
	add_child(canvas)

	var top_bar := ColorRect.new()
	top_bar.color = Color("#07151aee")
	top_bar.position = Vector2(18, 18)
	top_bar.size = Vector2(1144, 78)
	canvas.add_child(top_bar)

	var title := Label.new()
	title.text = "SALARYMAN  /  SHADOW TOWER"
	title.position = Vector2(24, 13)
	title.add_theme_font_size_override("font_size", 23)
	title.add_theme_color_override("font_color", Color("#eff8df"))
	top_bar.add_child(title)

	room_label = Label.new()
	room_label.position = Vector2(25, 46)
	room_label.add_theme_font_size_override("font_size", 12)
	room_label.add_theme_color_override("font_color", Color("#9fd3bd"))
	top_bar.add_child(room_label)

	status_label = Label.new()
	status_label.position = Vector2(760, 25)
	status_label.add_theme_font_size_override("font_size", 13)
	status_label.add_theme_color_override("font_color", Color("#f8b957"))
	status_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	status_label.size = Vector2(350, 24)
	top_bar.add_child(status_label)

	mission_label = Label.new()
	mission_label.position = Vector2(30, 650)
	mission_label.add_theme_font_size_override("font_size", 14)
	mission_label.add_theme_color_override("font_color", Color("#fff0ae"))
	canvas.add_child(mission_label)

	notice_label = Label.new()
	notice_label.position = Vector2(30, 678)
	notice_label.add_theme_font_size_override("font_size", 12)
	notice_label.add_theme_color_override("font_color", Color("#a8c8b6"))
	canvas.add_child(notice_label)

	var controls := Label.new()
	controls.text = "WASD / ARROWS MOVE    E INTERACT    1–6 ROOMS    +/- ZOOM    SPACE PAUSE    R RECONNECT"
	controls.position = Vector2(30, 704)
	controls.add_theme_font_size_override("font_size", 11)
	controls.add_theme_color_override("font_color", Color("#8bb0aa"))
	canvas.add_child(controls)


func _connect_to_pygame() -> void:
	var error := connection.connect_to_host(HOST, PORT)
	if error != OK:
		connection_status = "Pygame bridge unavailable · start pygame_sim first"
	else:
		connection_status = "connecting to Pygame…"


func _process(delta: float) -> void:
	animation_clock += delta
	connection.poll()
	match connection.get_status():
		StreamPeerTCP.STATUS_CONNECTED:
			connection_status = "bridge live · Pygame authoritative"
			_send_current_input()
			_read_messages()
		StreamPeerTCP.STATUS_CONNECTING:
			connection_status = "connecting to Pygame…"
		_:
			connection_status = "bridge offline · press R to reconnect"

	_smooth_visual_player(delta)
	_update_camera(delta)
	_update_hud()
	_update_player_animation()
	_update_art_motion(delta)


func _read_messages() -> void:
	var available := connection.get_available_bytes()
	if available <= 0:
		return
	var result := connection.get_data(available)
	if result[0] != OK:
		return
	receive_buffer += result[1].get_string_from_utf8()
	while receive_buffer.contains("\n"):
		var newline := receive_buffer.find("\n")
		var line := receive_buffer.substr(0, newline)
		receive_buffer = receive_buffer.substr(newline + 1)
		if line.strip_edges().is_empty():
			continue
		var parsed = JSON.parse_string(line)
		if parsed is Dictionary:
			_handle_message(parsed)


func _handle_message(message: Dictionary) -> void:
	match message.get("type", ""):
		"snapshot":
			snapshot = message
			var sequence := int(message.get("sequence", -1))
			if sequence != last_sequence:
				last_sequence = sequence
				_apply_snapshot(message)
		"error":
			connection_status = "bridge error · %s" % message.get("message", "unknown")


func _apply_snapshot(message: Dictionary) -> void:
	var scene_data: Dictionary = message.get("scene", {})
	var player: Dictionary = scene_data.get("player", {})
	var target := _pygame_to_world(float(player.get("x", 0)), float(player.get("y", 0)))
	target_player_world = target
	if not visual_player_ready:
		visual_player_world = target
		visual_player_ready = true

	var room_id := str(scene_data.get("room", ""))
	if room_id != last_room_id:
		last_room_id = room_id
		_rebuild_bridge_objects(scene_data.get("objects", []))


func _pygame_to_world(x: float, y: float) -> Vector3:
	return Vector3(x * WORLD_SCALE, 0.42, y * WORLD_SCALE)


func _smooth_visual_player(delta: float) -> void:
	if not visual_player_ready:
		return
	visual_player_world = visual_player_world.lerp(target_player_world, min(1.0, delta * 14.0))
	if player_root:
		player_root.position = visual_player_world + Vector3(0.0, sin(animation_clock * 5.0) * 0.025, 0.0)


func _rebuild_bridge_objects(objects: Array) -> void:
	for child in dynamic_root.get_children():
		child.queue_free()
	interaction_rings.clear()
	for item in objects:
		var object: Dictionary = item
		var position := _pygame_to_world(float(object.get("x", 0)), float(object.get("y", 0)))
		var kind := str(object.get("kind", ""))
		var marker := _build_bridge_object(kind, position)
		marker.name = str(object.get("id", "bridge-object"))
		if bool(object.get("nearby", false)):
			_add_interaction_ring(position)


func _build_bridge_object(kind: String, position: Vector3) -> Node3D:
	var packed_name := ""
	if kind == "desk" or kind == "chair":
		packed_name = "chair" if kind == "chair" else "table"
	elif kind == "window":
		var window := _add_box_to_dynamic("Window", position + Vector3(0, 1.0, 0), Vector3(1.3, 1.1, 0.08), materials["glass"])
		return window
	elif kind == "door":
		return _add_box_to_dynamic("Door", position + Vector3(0, 0.85, 0), Vector3(1.4, 1.7, 0.18), materials["door"])
	elif kind == "elevator" or kind == "stairs":
		return _add_box_to_dynamic("Circulation", position + Vector3(0, 0.55, 0), Vector3(1.6, 1.1, 1.4), materials["metal"])
	elif kind == "telephone" or kind == "pay_phone" or kind == "crt_terminal" or kind == "tv" or kind == "atm" or kind == "vending_machine" or kind == "arcade":
		return _add_box_to_dynamic("Terminal", position + Vector3(0, 0.45, 0), Vector3(0.65, 0.9, 0.55), materials["metal"])
	if packed_name != "":
		var packed: PackedScene = imported_scenes.get(packed_name)
		if packed:
			var instance := packed.instantiate()
			instance.position = position
			instance.scale = Vector3.ONE * 0.7
			dynamic_root.add_child(instance)
			return instance
	return _add_box_to_dynamic("Object", position + Vector3(0, 0.35, 0), Vector3(0.7, 0.7, 0.7), materials["wall_trim"])


func _add_box_to_dynamic(node_name: String, position: Vector3, size: Vector3, material: Material) -> MeshInstance3D:
	var mesh := BoxMesh.new()
	mesh.size = size
	mesh.material = material
	var instance := MeshInstance3D.new()
	instance.name = node_name
	instance.mesh = mesh
	instance.position = position
	instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	dynamic_root.add_child(instance)
	return instance


func _add_interaction_ring(position: Vector3) -> void:
	var ring := CylinderMesh.new()
	ring.top_radius = 0.78
	ring.bottom_radius = 0.78
	ring.height = 0.025
	ring.material = materials["marker"]
	var instance := MeshInstance3D.new()
	instance.name = "NearbyInteraction"
	instance.mesh = ring
	instance.position = position + Vector3(0, 0.03, 0)
	dynamic_root.add_child(instance)
	interaction_rings.append(instance)


func _update_camera(delta: float) -> void:
	if camera == null:
		camera = Camera3D.new()
		camera.name = "FollowCamera"
		camera.projection = Camera3D.PROJECTION_ORTHOGONAL
		camera.size = CAMERA_ORTHO_SIZE_BASE
		camera.near = 0.05
		camera.far = 120.0
		add_child(camera)
		camera.current = true
	var desired_target := visual_player_world + Vector3(0.0, 0.2, 0.0)
	camera_target = camera_target.lerp(desired_target, min(1.0, delta * 5.0))
	var offset := Vector3(camera_distance * 0.78, camera_distance * 0.82, camera_distance * 0.78)
	var desired_position := camera_target + offset
	camera.position = camera.position.lerp(desired_position, min(1.0, delta * 5.0))
	var desired_size: float = clampf(
		CAMERA_ORTHO_SIZE_BASE + (camera_distance - 14.0) * 0.55,
		CAMERA_ORTHO_SIZE_MIN,
		CAMERA_ORTHO_SIZE_MAX,
	)
	camera.size = lerp(camera.size, desired_size, min(1.0, delta * 6.0))
	camera.look_at(camera_target, Vector3.UP)


func _update_art_motion(delta: float) -> void:
	# These accents are renderer-only. Pygame remains the authority for all
	# positions and interactions; this layer adds a tactile 2.5D presentation.
	if lobby_light:
		lobby_light.light_energy = 2.15 + sin(animation_clock * 1.7) * 0.12
	if rim_light:
		rim_light.light_energy = 1.3 + sin(animation_clock * 1.1 + 0.8) * 0.1
	for index in range(interaction_rings.size()):
		var ring := interaction_rings[index]
		if not is_instance_valid(ring):
			continue
		var pulse := (sin(animation_clock * 3.4 + float(index) * 0.7) + 1.0) * 0.5
		var scale_value := 0.82 + pulse * 0.2
		ring.scale = Vector3(scale_value, 1.0, scale_value)
		ring.rotation.y += delta * (0.55 + pulse * 0.25)


func _update_player_animation() -> void:
	var scene_data: Dictionary = snapshot.get("scene", {})
	var player: Dictionary = scene_data.get("player", {})
	var moving := visual_player_world.distance_to(target_player_world) > 0.018
	_set_player_animation("walk" if moving else "idle")


func _update_hud() -> void:
	status_label.text = connection_status
	var scene_data: Dictionary = snapshot.get("scene", {})
	var office: Dictionary = snapshot.get("office", {})
	var room_id := str(scene_data.get("room", "waiting for bridge"))
	room_label.text = "FLOOR %02d  ·  %s" % [int(scene_data.get("floor", 1)), room_id.to_upper()]
	var navigation: Dictionary = scene_data.get("navigation", {})
	mission_label.text = "MISSION  ·  " + str(navigation.get("mission", "Connect to Pygame to receive the room mission."))
	notice_label.text = "ƒ%.2f  ·  %s" % [float(office.get("funds", 0.0)), str(office.get("notice", "WAITING FOR PYGAME"))]


func _send_command(name: String, payload: Dictionary = {}) -> void:
	if connection.get_status() != StreamPeerTCP.STATUS_CONNECTED:
		return
	command_sequence += 1
	var message := {
		"type": "command",
		"version": PROTOCOL_VERSION,
		"id": "godot-%d" % command_sequence,
		"name": name,
		"payload": payload,
	}
	connection.put_data((JSON.stringify(message) + "\n").to_utf8_buffer())


func _input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		match event.keycode:
			KEY_E:
				_send_command("interact")
			KEY_1:
				_send_command("select_room", {"room": "lobby"})
			KEY_2:
				_send_command("select_room", {"room": "recreation"})
			KEY_3:
				_send_command("select_room", {"room": "executive"})
			KEY_4:
				_send_command("select_room", {"room": "public"})
			KEY_5:
				_send_command("select_room", {"room": "office_03"})
			KEY_6:
				_send_command("select_room", {"room": "office_04"})
			KEY_SPACE:
				_send_command("toggle_running")
			KEY_N:
				_send_command("toggle_recruitment")
			KEY_B:
				_send_command("start_break", {"kind": "short"})
			KEY_T:
				_send_command("toggle_auto_breaks")
			KEY_EQUAL, KEY_KP_ADD:
				camera_distance = max(CAMERA_DISTANCE_MIN, camera_distance - 1.5)
			KEY_MINUS, KEY_KP_SUBTRACT:
				camera_distance = min(CAMERA_DISTANCE_MAX, camera_distance + 1.5)
			KEY_R:
				connection.disconnect_from_host()
				connection = StreamPeerTCP.new()
				_connect_to_pygame()
	elif event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP:
			camera_distance = max(CAMERA_DISTANCE_MIN, camera_distance - 1.5)
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			camera_distance = min(CAMERA_DISTANCE_MAX, camera_distance + 1.5)


func _send_current_input() -> void:
	var x := int(Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT)) - int(Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT))
	var y := int(Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN)) - int(Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP))
	_send_command("set_input", {"x": x, "y": y})