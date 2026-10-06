extends Node3D

## Godot game client for the Python office simulation.
##
## Godot owns real-time movement, collision, and animation. Python retains the
## office simulation, interactions, finance, and persistent state.

const PROTOCOL_VERSION := 1
const PlayerController = preload("res://player_controller.gd")
const HOST := "127.0.0.1"
const PORT := 4242
const WORLD_SCALE := 0.01
const WORLD_ORIGIN_REBASE_THRESHOLD := 1_000_000.0
const LOBBY_RENDER_ANCHOR_PX := Vector2i(2250, 2200)
const FLOOR_HEIGHT := 0.08
const WALL_HEIGHT := 2.7
const CAMERA_DISTANCE_MIN := 8.0
const CAMERA_DISTANCE_MAX := 22.0
const CAMERA_ORTHO_SIZE_MIN := 9.0
const CAMERA_ORTHO_SIZE_MAX := 18.0
const CAMERA_ORTHO_SIZE_BASE := 13.0
const CAMERA_FOLLOW_RESPONSE := 5.0
const CAMERA_ZOOM_RESPONSE := 6.0
const CAMERA_LOOK_AHEAD_SECONDS := 0.18
const CAMERA_LOOK_AHEAD_MAX_SPEED := 3.2
# Room floors are 0.16 units above the world origin (0.08 center + 0.08
# half-height). Keep the player root on that same surface; the imported
# character's feet are authored at its local origin.
const PLAYER_GROUND_Y := FLOOR_HEIGHT + 0.08

var connection := StreamPeerTCP.new()
var receive_buffer := ""
var snapshot: Dictionary = {}
var connection_status := "connecting to Python…"
var command_sequence := 0
var visual_player_world := Vector3(0.0, PLAYER_GROUND_Y, 0.0)
var visual_player_ready := false
var target_player_world := Vector3.ZERO
var visual_player_velocity := Vector3.ZERO
var animation_clock := 0.0
var camera_distance := 12.0
var last_room_id := ""
var last_floor_number := -1
var last_sequence := -1
var lobby_light: OmniLight3D
var rim_light: OmniLight3D
var interaction_rings: Array[MeshInstance3D] = []

var world_root: Node3D
var dynamic_root: Node3D
var automation_root: Node3D
var player_root: PlayerController
var player_shadow: MeshInstance3D
var camera: Camera3D
var camera_has_tracking_target := false
var interface_root: Control
var warm_lamp_light: OmniLight3D
var lobby_render_origin_px := Vector2i.ZERO
var status_label: Label
var room_label: Label
var mission_label: Label
var notice_label: Label
var controls_label: Label
var camera_target := Vector3.ZERO
var camera_focus_amount := 0.0
var elevator_floor_panel: ColorRect
var elevator_floor_label: Label
var native_app_panel: ColorRect
var native_app_title: Label
var native_app_body: Label
var native_app_footer: Label
var selected_elevator_floor := 1
var elevator_transition_active := false
var elevator_transition_phase := ""
var elevator_origin_floor := 1
var elevator_destination_floor := 1
var elevator_origin_room := ""
var elevator_destination_room := ""
var elevator_return_camera_distance := 12.0
var elevator_transition_root: Node3D
var elevator_transition_doors: Array[MeshInstance3D] = []

var materials: Dictionary = {}
var imported_scenes: Dictionary = {}
var automation_actors: Dictionary = {}
var automation_animations: Dictionary = {}
var automation_targets: Dictionary = {}


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
	materials["hall_floor"] = _material(Color("#415965"), 0.84)
	materials["lobby_floor"] = _material(Color("#3d655a"), 0.78)
	materials["lobby_rug"] = _material(Color("#55433c"), 0.96)
	materials["lobby_rug_field"] = _material(Color("#705949"), 0.96)
	materials["lobby_rug_trim"] = _material(Color("#a6814d"), 0.86)
	materials["office_rug"] = _material(Color("#4b3d38"), 0.94)
	materials["office_rug_field"] = _material(Color("#665247"), 0.94)
	materials["office_rug_trim"] = _material(Color("#a18155"), 0.84)
	materials["crt_screen"] = _material(Color("#9c733d"), 0.3, false, 0.0, Color("#9c733d"))
	materials["lamp_glow"] = _material(Color("#ffd28d"), 0.28, false, 0.0, Color("#ffd28d"))
	materials["character_shadow"] = _material(Color(0.06, 0.09, 0.08, 0.28), 0.95, true)
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
	environment_data.ambient_light_energy = 0.42
	environment_data.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	environment.environment = environment_data
	add_child(environment)

	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-52.0, -32.0, 0.0)
	sun.light_color = Color("#ffe4b0")
	sun.light_energy = 0.78
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 80.0
	add_child(sun)

	lobby_light = OmniLight3D.new()
	lobby_light.position = Vector3(10.0, 4.5, 15.0)
	lobby_light.light_color = Color("#7ee0c5")
	lobby_light.light_energy = 1.45
	lobby_light.omni_range = 13.0
	lobby_light.shadow_enabled = true
	add_child(lobby_light)

	rim_light = OmniLight3D.new()
	rim_light.position = Vector3(-7.0, 5.5, -5.0)
	rim_light.light_color = Color("#68b8ff")
	rim_light.light_energy = 0.8
	rim_light.omni_range = 19.0
	rim_light.shadow_enabled = true
	add_child(rim_light)

	warm_lamp_light = OmniLight3D.new()
	warm_lamp_light.name = "LobbyLampGlow"
	warm_lamp_light.position = Vector3(27.0, 2.25, 18.5)
	warm_lamp_light.light_color = Color("#ffd095")
	warm_lamp_light.light_energy = 0.95
	warm_lamp_light.omni_range = 5.5
	warm_lamp_light.shadow_enabled = false
	add_child(warm_lamp_light)


func _build_building_shell() -> void:
	world_root = Node3D.new()
	world_root.name = "ShadowTowerFloor01"
	add_child(world_root)

	dynamic_root = Node3D.new()
	dynamic_root.name = "BridgeObjects"
	world_root.add_child(dynamic_root)

	automation_root = Node3D.new()
	automation_root.name = "AutomationCharacters"
	world_root.add_child(automation_root)

	var floor_plan := _load_floor_plan()
	var base_layout: Dictionary = floor_plan.get("baseLayout", {})
	var elevator_lobby: Dictionary = base_layout.get("elevatorLobby", {})
	var lobby_spawn: Array = elevator_lobby.get("spawn", [])
	var lobby_bounds: Array = elevator_lobby.get("bounds", [])
	if lobby_spawn.size() >= 2:
		lobby_render_origin_px = Vector2i(int(lobby_spawn[0]), int(lobby_spawn[1])) - LOBBY_RENDER_ANCHOR_PX
	var room_specs: Array = []
	for room_data in floor_plan["rooms"]:
		var bounds: Array = room_data["bounds"]
		if room_data["id"] == "lobby" and lobby_bounds.size() >= 4:
			bounds = lobby_bounds
		room_specs.append({
			"id": room_data["id"],
			"label": room_data["label"],
			"rect": Rect2(bounds[0], bounds[1], bounds[2], bounds[3]),
			"material": room_data["material"],
		})
	for spec in room_specs:
		_add_room_shell(spec, floor_plan)
	_build_room_lighting()
	_build_lobby_building_services()


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
	var rect_size_px := Vector2i(roundi(rect.size.x), roundi(rect.size.y))
	var render_position_px := Vector2i(roundi(rect.position.x), roundi(rect.position.y))
	if room_id == "lobby":
		render_position_px -= lobby_render_origin_px
		for room_data in floor_plan["rooms"]:
			if room_data["id"] == "recreation":
				var hallway_bounds: Array = room_data["bounds"]
				var hallway_top_px := int(hallway_bounds[1])
				if hallway_top_px > render_position_px.y:
					rect_size_px.y = mini(rect_size_px.y, hallway_top_px - render_position_px.y)
				break
	var center_px := render_position_px + rect_size_px / 2
	var center := Vector3(float(center_px.x) * WORLD_SCALE, FLOOR_HEIGHT, float(center_px.y) * WORLD_SCALE)
	var size := Vector3(float(rect_size_px.x) * WORLD_SCALE, 0.16, float(rect_size_px.y) * WORLD_SCALE)
	_add_solid_box("%sFloor" % room_id, center, size, materials[spec["material"]])

	var left := float(render_position_px.x) * WORLD_SCALE
	var right := float(render_position_px.x + rect_size_px.x) * WORLD_SCALE
	var top := float(render_position_px.y) * WORLD_SCALE
	var bottom := float(render_position_px.y + rect_size_px.y) * WORLD_SCALE
	var wall_thickness := 0.26
	_add_solid_box("%sWallLeft" % room_id, Vector3(left, WALL_HEIGHT / 2.0, (top + bottom) / 2.0), Vector3(wall_thickness, WALL_HEIGHT, float(rect_size_px.y) * WORLD_SCALE), materials["wall"])
	_add_solid_box("%sWallRight" % room_id, Vector3(right, WALL_HEIGHT / 2.0, (top + bottom) / 2.0), Vector3(wall_thickness, WALL_HEIGHT, float(rect_size_px.y) * WORLD_SCALE), materials["wall"])

	if room_id == "recreation":
		var door_centers: Array = []
		for door_x in floor_plan["officeDoorCenters"]:
			door_centers.append(float(door_x) * WORLD_SCALE)
		_add_horizontal_wall_segments("%sWallBottom" % room_id, left, right, bottom, door_centers, 1.55)
	elif room_id == "lobby":
		_add_solid_box("%sWallTop" % room_id, Vector3((left + right) / 2.0, WALL_HEIGHT / 2.0, top), Vector3(float(rect_size_px.x) * WORLD_SCALE, WALL_HEIGHT, wall_thickness), materials["wall"])
		_add_horizontal_wall_segments("%sWallBottom" % room_id, left, right, bottom, [float(floor_plan["lobbyHallwayOpening"]) * WORLD_SCALE], 1.8)
	elif room_id.begins_with("office") or room_id == "executive" or room_id == "public":
		_add_solid_box("%sBackWall" % room_id, Vector3((left + right) / 2.0, WALL_HEIGHT / 2.0, bottom), Vector3(float(rect_size_px.x) * WORLD_SCALE, WALL_HEIGHT, wall_thickness), materials["wall"])
	else:
		_add_solid_box("%sWallTop" % room_id, Vector3((left + right) / 2.0, WALL_HEIGHT / 2.0, top), Vector3(rect.size.x * WORLD_SCALE, WALL_HEIGHT, wall_thickness), materials["wall"])
		_add_solid_box("%sWallBottom" % room_id, Vector3((left + right) / 2.0, WALL_HEIGHT / 2.0, bottom), Vector3(rect.size.x * WORLD_SCALE, WALL_HEIGHT, wall_thickness), materials["wall"])


func _add_horizontal_wall_segments(node_prefix: String, left: float, right: float, z: float, door_centers: Array, opening_width: float) -> void:
	var cursor := left
	for door_center in door_centers:
		var center := float(door_center)
		var opening_left := center - opening_width / 2.0
		var opening_right := center + opening_width / 2.0
		if opening_left > cursor:
			_add_solid_box("%sSegment%d" % [node_prefix, int(cursor * 100.0)], Vector3((cursor + opening_left) / 2.0, WALL_HEIGHT / 2.0, z), Vector3(opening_left - cursor, WALL_HEIGHT, 0.26), materials["wall"])
		var frame_width := 0.13
		var frame_depth := 0.34
		var frame_height := 0.18
		_add_box("%sFrameLeft%d" % [node_prefix, int(center * 100.0)], Vector3(opening_left + frame_width / 2.0, WALL_HEIGHT / 2.0, z), Vector3(frame_width, WALL_HEIGHT, frame_depth), materials["wall_trim"])
		_add_box("%sFrameRight%d" % [node_prefix, int(center * 100.0)], Vector3(opening_right - frame_width / 2.0, WALL_HEIGHT / 2.0, z), Vector3(frame_width, WALL_HEIGHT, frame_depth), materials["wall_trim"])
		_add_box("%sFrameHeader%d" % [node_prefix, int(center * 100.0)], Vector3(center, WALL_HEIGHT - frame_height / 2.0, z), Vector3(opening_width, frame_height, frame_depth), materials["wall_trim"])
		cursor = opening_right
	if cursor < right:
		_add_solid_box("%sEnd" % node_prefix, Vector3((cursor + right) / 2.0, WALL_HEIGHT / 2.0, z), Vector3(right - cursor, WALL_HEIGHT, 0.26), materials["wall"])


func _build_static_furniture() -> void:
	imported_scenes["table"] = load("res://agentshire-assets/furniture/table_medium.gltf")
	imported_scenes["chair"] = load("res://agentshire-assets/furniture/chair_A.gltf")
	imported_scenes["couch"] = load("res://agentshire-assets/furniture/couch.gltf")
	imported_scenes["lamp"] = load("res://agentshire-assets/furniture/lamp_standing.gltf")
	imported_scenes["character"] = load("res://agentshire-assets/characters/character-male-a.glb")

	_add_lobby_rug()
	_add_hallway_runner_rug()
	_add_office_rugs()
	_add_imported("LobbyCouch", "couch", Vector3(18.0, 0.0, 24.5), 1.25)
	_add_imported("LobbyLamp", "lamp", Vector3(27.0, 0.0, 18.5), 1.1)


func _add_lobby_rug() -> void:
	# Renderer-only lounge detail. Pygame still owns all collisions and objects.
	_add_box("LobbyRug", Vector3(22.5, 0.164, 22.0), Vector3(12.0, 0.008, 10.0), materials["lobby_rug"])
	_add_box("LobbyRugInset", Vector3(22.5, 0.169, 22.0), Vector3(11.65, 0.003, 9.65), materials["lobby_rug_field"])
	var trim_y := 0.171
	var trim_height := 0.003
	_add_box("LobbyRugTrimNorth", Vector3(22.5, trim_y, 17.18), Vector3(11.7, trim_height, 0.10), materials["lobby_rug_trim"])
	_add_box("LobbyRugTrimSouth", Vector3(22.5, trim_y, 26.82), Vector3(11.7, trim_height, 0.10), materials["lobby_rug_trim"])
	_add_box("LobbyRugTrimWest", Vector3(16.68, trim_y, 22.0), Vector3(0.10, trim_height, 9.55), materials["lobby_rug_trim"])
	_add_box("LobbyRugTrimEast", Vector3(28.32, trim_y, 22.0), Vector3(0.10, trim_height, 9.55), materials["lobby_rug_trim"])


func _add_hallway_runner_rug() -> void:
	var center := Vector3(48.5, 0.164, 43.0)
	var length := 70.0
	var width := 2.6
	_add_box("HallwayRunner", center, Vector3(length, 0.008, width), materials["office_rug"])
	_add_box("HallwayRunnerField", center + Vector3(0.0, 0.005, 0.0), Vector3(length - 0.32, 0.003, width - 0.32), materials["office_rug_field"])
	for end_sign in [-1.0, 1.0]:
		_add_box("HallwayRunnerEndTrim%s" % str(end_sign), center + Vector3(end_sign * (length / 2.0 - 0.12), 0.009, 0.0), Vector3(0.10, 0.003, width - 0.15), materials["office_rug_trim"])


func _add_office_rugs() -> void:
	for room_center_x in [18.0, 39.0, 60.0, 81.0]:
		var rug_name := "OfficeRug%d" % int(room_center_x)
		var center := Vector3(room_center_x, 0.164, 63.0)
		_add_box(rug_name, center, Vector3(14.0, 0.008, 12.0), materials["office_rug"])
		_add_box(rug_name + "Field", center + Vector3(0.0, 0.005, 0.0), Vector3(13.65, 0.003, 11.65), materials["office_rug_field"])
		_add_box(rug_name + "TrimNorth", center + Vector3(0.0, 0.009, -5.88), Vector3(13.7, 0.003, 0.10), materials["office_rug_trim"])
		_add_box(rug_name + "TrimSouth", center + Vector3(0.0, 0.009, 5.88), Vector3(13.7, 0.003, 0.10), materials["office_rug_trim"])


func _build_room_lighting() -> void:
	_add_room_light("HallwayLightWest", Vector3(28.0, 3.2, 43.0), Color("#ffd29a"), 0.52, 13.0)
	_add_room_light("HallwayLightEast", Vector3(69.0, 3.2, 43.0), Color("#ffd29a"), 0.52, 13.0)
	_add_wall_sconce("HallwaySconceWest", Vector3(7.2, 2.25, 39.0))
	_add_wall_sconce("HallwaySconceEast", Vector3(89.8, 2.25, 47.0))
	for room_center_x in [18.0, 39.0, 60.0, 81.0]:
		_add_room_light("OfficeLight%d" % int(room_center_x), Vector3(room_center_x, 3.0, 63.0), Color("#f3c88d"), 0.42, 10.0)


func _build_lobby_building_services() -> void:
	# Exposed service runs follow the lobby wall lines instead of floating in
	# the room. They are visual building infrastructure, not walkable props.
	var lobby_left := -7.3
	var lobby_right := 32.3
	var lobby_back := -7.8
	var lobby_front := 33.6
	var pipe_height := 2.35
	_add_service_pipe(
		"LobbyWaterMain",
		Vector3(lobby_left, pipe_height, lobby_back),
		Vector3(lobby_right, pipe_height, lobby_back),
		0.075,
		materials["metal"],
	)
	_add_service_pipe(
		"LobbyWaterBranch",
		Vector3(lobby_right, pipe_height, lobby_back),
		Vector3(lobby_right, pipe_height, lobby_front),
		0.075,
		materials["metal"],
	)
	_add_service_pipe(
		"LobbyElectricalConduit",
		Vector3(lobby_left, 2.12, lobby_back + 0.24),
		Vector3(lobby_right, 2.12, lobby_back + 0.24),
		0.035,
		materials["wall_trim"],
	)
	_add_service_pipe(
		"LobbyElevatorRiser",
		Vector3(7.0, 0.34, 21.0),
		Vector3(7.0, 2.55, 21.0),
		0.055,
		materials["metal"],
	)
	for bracket_index in range(8):
		var bracket_x := lobby_left + 4.0 + float(bracket_index) * 4.5
		_add_box(
			"LobbyPipeBracket%d" % bracket_index,
			Vector3(bracket_x, pipe_height, lobby_back + 0.08),
			Vector3(0.12, 0.2, 0.32),
			materials["wall_trim"],
		)


func _add_service_pipe(
	node_name: String,
	start: Vector3,
	finish: Vector3,
	radius: float,
	material: Material,
) -> void:
	var direction := finish - start
	var pipe := MeshInstance3D.new()
	pipe.name = node_name
	var mesh := CylinderMesh.new()
	mesh.top_radius = radius
	mesh.bottom_radius = radius
	mesh.height = direction.length()
	mesh.radial_segments = 10
	mesh.material = material
	pipe.mesh = mesh
	pipe.position = (start + finish) / 2.0
	if absf(direction.x) >= absf(direction.z) and absf(direction.x) > 0.001:
		pipe.rotation.z = PI / 2.0
	elif absf(direction.z) > 0.001:
		pipe.rotation.x = PI / 2.0
	pipe.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	world_root.add_child(pipe)


func _add_room_light(light_name: String, position: Vector3, color: Color, energy: float, range: float) -> void:
	var light := OmniLight3D.new()
	light.name = light_name
	light.position = position
	light.light_color = color
	light.light_energy = energy
	light.omni_range = range
	light.shadow_enabled = false
	world_root.add_child(light)


func _add_wall_sconce(sconce_name: String, position: Vector3) -> void:
	_add_box(sconce_name + "Base", position, Vector3(0.22, 0.42, 0.16), materials["metal"])
	_add_box(sconce_name + "Glow", position + Vector3(0.0, 0.0, 0.12), Vector3(0.14, 0.24, 0.07), materials["lamp_glow"])


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


func _add_solid_box(node_name: String, position: Vector3, size: Vector3, material: Material) -> MeshInstance3D:
	var visual := _add_box(node_name, position, size, material)
	var body := StaticBody3D.new()
	body.name = node_name + "Collider"
	body.position = position
	body.collision_layer = 1
	body.collision_mask = 0
	var shape := BoxShape3D.new()
	shape.size = size
	var collision := CollisionShape3D.new()
	collision.shape = shape
	body.add_child(collision)
	world_root.add_child(body)
	return visual


func _load_player() -> void:
	player_root = PlayerController.new()
	player_root.name = "AuthoritativePlayer"
	player_root.configure_character(imported_scenes.get("character") as PackedScene)
	player_root.action_requested.connect(_on_player_action_requested)
	world_root.add_child(player_root)
	player_shadow = _add_character_shadow(player_root, 0.38)


func _on_player_action_requested(action: String) -> void:
	_send_command("set_action", {"action": action})


func _add_character_shadow(parent: Node3D, radius: float) -> MeshInstance3D:
	var mesh := CylinderMesh.new()
	mesh.top_radius = radius * 0.78
	mesh.bottom_radius = radius
	mesh.height = 0.025
	mesh.radial_segments = 20
	mesh.material = materials["character_shadow"]
	var shadow := MeshInstance3D.new()
	shadow.name = "PixelCharacterGroundingShadow"
	shadow.mesh = mesh
	shadow.position = Vector3(0.0, 0.02, 0.0)
	shadow.scale = Vector3(1.35, 1.0, 0.78)
	shadow.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(shadow)
	return shadow


func _sync_automation_characters(characters: Array) -> void:
	var active_domains: Dictionary = {}
	for index in range(characters.size()):
		var character: Dictionary = characters[index]
		var domain := str(character.get("domain", ""))
		if domain.is_empty():
			continue
		active_domains[domain] = true
		var target := _pygame_to_world(float(character.get("x", 0)), float(character.get("y", 0)))
		var actor_root: Node3D = automation_actors.get(domain)
		if actor_root == null or not is_instance_valid(actor_root):
			var packed := imported_scenes.get("character") as PackedScene
			if packed == null:
				push_error("Godot character scene is missing for automation actor %s." % domain)
				continue
			actor_root = Node3D.new()
			actor_root.name = "Automation-" + domain
			actor_root.position = target
			var model := packed.instantiate() as Node3D
			model.name = "CharacterModel"
			actor_root.add_child(model)
			var actor_animation := PlayerController.configure_character_model(model)
			if actor_animation != null:
				actor_animation.play("idle")
			_add_character_shadow(actor_root, 0.34)

			var name_tag := Label3D.new()
			name_tag.name = "NameTag"
			name_tag.text = str(character.get("name", domain)).to_upper()
			name_tag.font_size = 24
			name_tag.pixel_size = 0.006
			name_tag.position = Vector3(0.0, 1.72, 0.0)
			name_tag.billboard = BaseMaterial3D.BILLBOARD_ENABLED
			name_tag.outline_size = 7
			name_tag.outline_modulate = Color("#14211e")
			var accent: Array = character.get("accent", [])
			if accent.size() >= 3:
				name_tag.modulate = Color8(int(accent[0]), int(accent[1]), int(accent[2]))
			actor_root.add_child(name_tag)
			automation_root.add_child(actor_root)
			automation_actors[domain] = actor_root
			automation_animations[domain] = actor_animation
		automation_targets[domain] = target

	for domain in automation_actors.keys():
		if active_domains.has(domain):
			continue
		var stale_root: Node3D = automation_actors[domain]
		if is_instance_valid(stale_root):
			stale_root.queue_free()
		automation_actors.erase(domain)
		automation_animations.erase(domain)
		automation_targets.erase(domain)


func _smooth_automation_characters(delta: float) -> void:
	for domain in automation_actors.keys():
		var actor_root: Node3D = automation_actors.get(domain)
		if actor_root == null or not is_instance_valid(actor_root):
			continue
		var target: Vector3 = automation_targets.get(domain, actor_root.position)
		var direction := target - actor_root.position
		direction.y = 0.0
		var moving := direction.length() > 0.035
		var blend := 1.0 - exp(-10.0 * delta)
		actor_root.position = actor_root.position.lerp(target, blend)
		var model := actor_root.get_node_or_null("CharacterModel") as Node3D
		if moving and model != null:
			model.rotation.y = atan2(direction.x, -direction.z)
		var actor_animation: AnimationPlayer = automation_animations.get(domain)
		if actor_animation != null:
			var desired_animation := "walk" if moving else "idle"
			if actor_animation.current_animation != desired_animation:
				actor_animation.play(desired_animation)


func _build_interface() -> void:
	var canvas := CanvasLayer.new()
	canvas.name = "HUD"
	add_child(canvas)

	interface_root = Control.new()
	interface_root.name = "DesignResolutionHUD"
	interface_root.size = Vector2(1180.0, 720.0)
	interface_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	canvas.add_child(interface_root)

	var top_bar := ColorRect.new()
	top_bar.color = Color("#07151aee")
	top_bar.position = Vector2(18, 18)
	top_bar.size = Vector2(1144, 78)
	interface_root.add_child(top_bar)

	var mission_plate := ColorRect.new()
	mission_plate.name = "MissionStatusPlate"
	mission_plate.color = Color("#07151ae0")
	mission_plate.position = Vector2(18, 638)
	mission_plate.size = Vector2(585, 64)
	mission_plate.mouse_filter = Control.MOUSE_FILTER_IGNORE
	interface_root.add_child(mission_plate)

	var controls_plate := ColorRect.new()
	controls_plate.name = "ControlsPlate"
	controls_plate.color = Color("#07151ae0")
	controls_plate.position = Vector2(620, 638)
	controls_plate.size = Vector2(542, 64)
	controls_plate.mouse_filter = Control.MOUSE_FILTER_IGNORE
	interface_root.add_child(controls_plate)

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
	interface_root.add_child(mission_label)

	notice_label = Label.new()
	notice_label.position = Vector2(30, 678)
	notice_label.add_theme_font_size_override("font_size", 12)
	notice_label.add_theme_color_override("font_color", Color("#a8c8b6"))
	interface_root.add_child(notice_label)

	controls_label = Label.new()
	controls_label.position = Vector2(636, 646)
	controls_label.size = Vector2(512, 48)
	controls_label.text = "WASD MOVE  ·  SHIFT SPRINT  ·  SPACE JUMP\nE USE / STAIRS  ·  C CLEAN  ·  V REPAIR"
	controls_label.add_theme_font_size_override("font_size", 12)
	controls_label.add_theme_color_override("font_color", Color("#c4ddcb"))
	interface_root.add_child(controls_label)

	native_app_panel = ColorRect.new()
	native_app_panel.name = "NativeGameAppPanel"
	native_app_panel.color = Color("#07151af5")
	native_app_panel.position = Vector2(300, 184)
	native_app_panel.size = Vector2(580, 352)
	native_app_panel.visible = false
	native_app_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	interface_root.add_child(native_app_panel)

	var app_panel_accent := ColorRect.new()
	app_panel_accent.color = Color("#f8b957")
	app_panel_accent.position = Vector2(0, 0)
	app_panel_accent.size = Vector2(580, 4)
	app_panel_accent.mouse_filter = Control.MOUSE_FILTER_IGNORE
	native_app_panel.add_child(app_panel_accent)

	native_app_title = Label.new()
	native_app_title.position = Vector2(28, 24)
	native_app_title.size = Vector2(524, 34)
	native_app_title.add_theme_font_size_override("font_size", 21)
	native_app_title.add_theme_color_override("font_color", Color("#eff8df"))
	native_app_panel.add_child(native_app_title)

	native_app_body = Label.new()
	native_app_body.position = Vector2(28, 78)
	native_app_body.size = Vector2(524, 215)
	native_app_body.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	native_app_body.add_theme_font_size_override("font_size", 16)
	native_app_body.add_theme_color_override("font_color", Color("#c4ddcb"))
	native_app_panel.add_child(native_app_body)

	native_app_footer = Label.new()
	native_app_footer.position = Vector2(28, 311)
	native_app_footer.size = Vector2(524, 22)
	native_app_footer.add_theme_font_size_override("font_size", 12)
	native_app_footer.add_theme_color_override("font_color", Color("#f8b957"))
	native_app_panel.add_child(native_app_footer)

	elevator_floor_panel = ColorRect.new()
	elevator_floor_panel.name = "ElevatorFloorPicker"
	elevator_floor_panel.color = Color("#07151af2")
	elevator_floor_panel.position = Vector2(390, 230)
	elevator_floor_panel.size = Vector2(400, 230)
	elevator_floor_panel.visible = false
	elevator_floor_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	interface_root.add_child(elevator_floor_panel)

	var elevator_title := Label.new()
	elevator_title.text = "ELEVATOR  /  SELECT DESTINATION"
	elevator_title.position = Vector2(28, 25)
	elevator_title.add_theme_font_size_override("font_size", 17)
	elevator_title.add_theme_color_override("font_color", Color("#eff8df"))
	elevator_floor_panel.add_child(elevator_title)

	elevator_floor_label = Label.new()
	elevator_floor_label.position = Vector2(28, 76)
	elevator_floor_label.size = Vector2(340, 56)
	elevator_floor_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	elevator_floor_label.add_theme_font_size_override("font_size", 32)
	elevator_floor_label.add_theme_color_override("font_color", Color("#fff0ae"))
	elevator_floor_panel.add_child(elevator_floor_label)

	var elevator_instructions := Label.new()
	elevator_instructions.text = "UP / DOWN  ·  CHOOSE FLOOR\nENTER  ·  RIDE     ESC  ·  CLOSE"
	elevator_instructions.position = Vector2(28, 154)
	elevator_instructions.size = Vector2(340, 54)
	elevator_instructions.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	elevator_instructions.add_theme_font_size_override("font_size", 13)
	elevator_instructions.add_theme_color_override("font_color", Color("#9fd3bd"))
	elevator_floor_panel.add_child(elevator_instructions)

	get_viewport().size_changed.connect(_update_interface_scale)
	_update_interface_scale()


func _update_interface_scale() -> void:
	if interface_root == null:
		return
	var viewport_size := get_viewport().get_visible_rect().size
	var scale_factor := minf(viewport_size.x / 1180.0, viewport_size.y / 720.0)
	if scale_factor <= 0.0:
		return
	var scaled_size := Vector2(1180.0, 720.0) * scale_factor
	interface_root.scale = Vector2.ONE * scale_factor
	interface_root.position = (viewport_size - scaled_size) / 2.0


func _connect_to_pygame() -> void:
	var error := connection.connect_to_host(HOST, PORT)
	if error != OK:
		connection_status = "Python bridge unavailable · start the desktop simulation"
	else:
		connection_status = "connecting to Python…"


func _process(delta: float) -> void:
	animation_clock += delta
	connection.poll()
	match connection.get_status():
		StreamPeerTCP.STATUS_CONNECTED:
			connection_status = "bridge live · Python simulation connected"
			player_root.set_bridge_connected(true)
			_send_current_input()
			_read_messages()
		StreamPeerTCP.STATUS_CONNECTING:
			connection_status = "connecting to Python…"
			player_root.set_bridge_connected(false)
		_:
			connection_status = "bridge offline · press R to reconnect"
			player_root.set_bridge_connected(false)

	_smooth_visual_player(delta)
	_update_camera(delta)
	_update_hud()
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
	var room_id := str(scene_data.get("room", ""))
	var floor_number := int(scene_data.get("floor", 1))
	if elevator_transition_active:
		if elevator_transition_phase == "waiting_destination" \
			and floor_number == elevator_destination_floor \
			and room_id == elevator_destination_room:
			_start_elevator_arrival(target, message)
		return

	target_player_world = target
	player_root.reconcile_authoritative_position(target)
	player_root.set_authoritative_action(str(player.get("action", "stand")))
	visual_player_ready = true

	var location_id := "%02d:%s" % [floor_number, room_id]
	if location_id != last_room_id:
		last_room_id = location_id
		last_floor_number = floor_number
		_rebuild_bridge_objects(scene_data.get("objects", []))
	_sync_automation_characters(scene_data.get("automationCharacters", []))


func _pygame_to_world(x: float, y: float) -> Vector3:
	var render_position_px := Vector2i(roundi(x), roundi(y))
	if maxf(absf(x), absf(y)) >= WORLD_ORIGIN_REBASE_THRESHOLD:
		# The lobby uses large Pygame world coordinates. Rebase only the view;
		# snapshots and all commands remain in Pygame's authoritative space.
		render_position_px -= lobby_render_origin_px
	return Vector3(float(render_position_px.x) * WORLD_SCALE, PLAYER_GROUND_Y, float(render_position_px.y) * WORLD_SCALE)


func _smooth_visual_player(delta: float) -> void:
	if visual_player_ready:
		visual_player_world = player_root.global_position
		visual_player_velocity = player_root.velocity
		if player_shadow != null:
			player_shadow.position.y = PLAYER_GROUND_Y - player_root.global_position.y + 0.02
	_smooth_automation_characters(delta)


func _rebuild_bridge_objects(objects: Array) -> void:
	for child in dynamic_root.get_children():
		child.queue_free()
	interaction_rings.clear()
	for item in objects:
		var object: Dictionary = item
		var position := _pygame_to_world(float(object.get("x", 0)), float(object.get("y", 0)))
		var kind := str(object.get("kind", ""))
		var object_id := str(object.get("id", "bridge-object"))
		var render_position := _pygame_to_world(
			float(object.get("displayX", object.get("x", 0))),
			float(object.get("displayY", object.get("y", 0))),
		)
		var marker := _build_bridge_object(kind, render_position, object_id)
		marker.name = object_id
		if bool(object.get("nearby", false)):
			_add_interaction_ring(position)


func _build_bridge_object(kind: String, position: Vector3, object_id: String) -> Node3D:
	if object_id == "lobby-reception-desk":
		return _build_reception_desk(position, object_id)
	if kind == "receptionist":
		return _build_receptionist(position, object_id)
	if kind == "floor_sign":
		return _build_floor_sign(position, object_id)
	if kind == "crt_terminal":
		return _build_crt_terminal(position, object_id)
	if kind == "desk_lamp":
		return _build_desk_lamp(position, object_id)
	if kind == "atm":
		return _build_atm(position, object_id)
	if kind == "vending_machine":
		return _build_vending_machine(position, object_id)
	var packed_name := ""
	if kind == "desk" or kind == "chair":
		packed_name = "chair" if kind == "chair" else "table"
	elif kind == "window":
		var window := _add_box_to_dynamic("Window", position + Vector3(0, 1.0, 0), Vector3(1.3, 1.1, 0.08), materials["glass"])
		return window
	elif kind == "door":
		return _build_door_visual(position, object_id)
	elif kind == "elevator":
		return _build_elevator_visual(position, object_id)
	elif kind == "stairs":
		return _build_staircase(position, object_id)
	elif kind == "telephone" or kind == "pay_phone" or kind == "tv" or kind == "atm" or kind == "vending_machine" or kind == "arcade":
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


func _build_reception_desk(position: Vector3, object_id: String) -> MeshInstance3D:
	_add_box_to_dynamic(
		object_id + "-front",
		position + Vector3(0.0, 0.48, 0.0),
		Vector3(3.6, 0.96, 0.72),
		materials["wall_trim"],
	)
	_add_box_to_dynamic(
		object_id + "-counter",
		position + Vector3(0.0, 1.0, 0.08),
		Vector3(3.9, 0.14, 1.05),
		materials["wall_trim"],
	)
	_add_box_to_dynamic(
		object_id + "-back",
		position + Vector3(0.0, 0.5, -0.52),
		Vector3(3.6, 1.0, 0.16),
		materials["metal"],
	)
	return dynamic_root.get_node(object_id + "-front") as MeshInstance3D


func _build_receptionist(position: Vector3, object_id: String) -> Node3D:
	var packed := imported_scenes.get("character") as PackedScene
	if packed == null:
		return _add_box_to_dynamic(
			object_id,
			position + Vector3(0.0, 0.8, 0.0),
			Vector3(0.45, 1.6, 0.45),
			materials["wall_trim"],
		)
	var receptionist := packed.instantiate() as Node3D
	receptionist.name = object_id
	receptionist.position = position
	receptionist.scale = Vector3.ONE * 0.72
	dynamic_root.add_child(receptionist)
	var receptionist_animation := PlayerController.configure_character_model(receptionist)
	if receptionist_animation != null and receptionist_animation.has_animation("idle"):
		receptionist_animation.play("idle")
	return receptionist


func _build_floor_sign(position: Vector3, object_id: String) -> MeshInstance3D:
	var plaque := _add_box_to_dynamic(
		object_id,
		position + Vector3(0.0, 2.25, -0.12),
		Vector3(1.25, 0.72, 0.12),
		materials["metal"],
	)
	var number := Label3D.new()
	number.name = object_id + "-number"
	var floor_number := int(snapshot.get("scene", {}).get("floor", 1))
	number.text = "FLOOR %02d" % floor_number
	number.font_size = 72
	number.pixel_size = 0.004
	number.position = position + Vector3(0.0, 2.23, 0.0)
	number.modulate = Color("#fff0ae")
	number.outline_size = 8
	number.outline_modulate = Color("#14211e")
	dynamic_root.add_child(number)
	return plaque


func _nearby_object_kind() -> String:
	var scene_data: Dictionary = snapshot.get("scene", {})
	for item in scene_data.get("objects", []):
		if item is Dictionary and bool(item.get("nearby", false)):
			return str(item.get("kind", ""))
	return ""


func _open_elevator_floor_picker() -> void:
	var scene_data: Dictionary = snapshot.get("scene", {})
	selected_elevator_floor = clampi(int(scene_data.get("floor", 1)), 1, 67)
	_refresh_elevator_floor_label()
	elevator_floor_panel.visible = true
	player_root.set_physics_process(false)


func _refresh_elevator_floor_label() -> void:
	if elevator_floor_label != null:
		elevator_floor_label.text = "FLOOR %02d" % selected_elevator_floor


func _handle_elevator_picker_key(keycode: int) -> bool:
	if elevator_floor_panel == null or not elevator_floor_panel.visible:
		return false
	match keycode:
		KEY_UP, KEY_KP_ADD:
			selected_elevator_floor = mini(67, selected_elevator_floor + 1)
			_refresh_elevator_floor_label()
		KEY_DOWN, KEY_KP_SUBTRACT:
			selected_elevator_floor = maxi(1, selected_elevator_floor - 1)
			_refresh_elevator_floor_label()
		KEY_ENTER, KEY_KP_ENTER:
			_commit_elevator_floor()
		KEY_ESCAPE:
			elevator_floor_panel.visible = false
			player_root.set_physics_process(true)
	return true


func _commit_elevator_floor() -> void:
	var scene_data: Dictionary = snapshot.get("scene", {})
	elevator_origin_floor = int(scene_data.get("floor", 1))
	elevator_origin_room = str(scene_data.get("room", ""))
	elevator_destination_floor = selected_elevator_floor
	elevator_destination_room = "recreation" if elevator_destination_floor > 1 \
		or (elevator_origin_floor == 1 and elevator_origin_room == "lobby") else "lobby"
	if elevator_destination_floor == elevator_origin_floor \
		and elevator_destination_room == elevator_origin_room:
		elevator_floor_panel.visible = false
		player_root.set_physics_process(true)
		notice_label.text = "ALREADY ON FLOOR %02d" % elevator_destination_floor
		return

	elevator_floor_panel.visible = false
	elevator_transition_active = true
	elevator_transition_phase = "closing"
	elevator_return_camera_distance = camera_distance
	player_root.set_physics_process(false)
	_build_elevator_transition_car(player_root.global_position)
	var tween := create_tween()
	tween.set_parallel(true)
	tween.tween_property(self, "camera_distance", CAMERA_DISTANCE_MIN, 0.45)
	if elevator_transition_doors.size() == 2:
		tween.tween_property(elevator_transition_doors[0], "position:x", -0.34, 0.4)
		tween.tween_property(elevator_transition_doors[1], "position:x", 0.34, 0.4)
	tween.set_parallel(false)
	tween.tween_interval(0.25)
	tween.tween_callback(_send_elevator_destination_command.bind(elevator_destination_floor))


func _build_elevator_transition_car(origin: Vector3) -> void:
	elevator_transition_root = Node3D.new()
	elevator_transition_root.name = "TransparentIsometricElevator"
	elevator_transition_root.global_position = origin + Vector3(0.0, -0.04, 0.0)
	dynamic_root.add_child(elevator_transition_root)
	elevator_transition_doors.clear()

	var glass := StandardMaterial3D.new()
	glass.albedo_color = Color(0.46, 0.83, 0.77, 0.25)
	glass.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	glass.cull_mode = BaseMaterial3D.CULL_DISABLED
	glass.roughness = 0.24

	var car_floor := _material(Color("#59776f"), 0.82)
	_add_transition_box("ElevatorFloor", Vector3(0.0, 0.06, 0.0), Vector3(2.3, 0.12, 2.3), car_floor)
	_add_transition_box("ElevatorRearGlass", Vector3(0.0, 1.38, -1.1), Vector3(2.3, 2.64, 0.06), glass)
	_add_transition_box("ElevatorLeftGlass", Vector3(-1.1, 1.38, 0.0), Vector3(0.06, 2.64, 2.3), glass)
	_add_transition_box("ElevatorRightGlass", Vector3(1.1, 1.38, 0.0), Vector3(0.06, 2.64, 2.3), glass)
	_add_transition_box("ElevatorCanopy", Vector3(0.0, 2.74, 0.0), Vector3(2.3, 0.08, 2.3), glass)

	var door_material := _material(Color("#b7d6c5"), 0.38)
	var left_door := _add_transition_box(
		"ElevatorLeftDoor",
		Vector3(-0.72, 1.25, 1.08),
		Vector3(0.72, 2.4, 0.07),
		door_material,
	)
	var right_door := _add_transition_box(
		"ElevatorRightDoor",
		Vector3(0.72, 1.25, 1.08),
		Vector3(0.72, 2.4, 0.07),
		door_material,
	)
	elevator_transition_doors.append(left_door)
	elevator_transition_doors.append(right_door)

	var floor_display := Label3D.new()
	floor_display.name = "ElevatorDestinationDisplay"
	floor_display.text = "FLOOR %02d" % elevator_destination_floor
	floor_display.font_size = 56
	floor_display.pixel_size = 0.005
	floor_display.position = Vector3(0.0, 2.35, 1.0)
	floor_display.modulate = Color("#fff0ae")
	floor_display.outline_size = 6
	floor_display.outline_modulate = Color("#14211e")
	elevator_transition_root.add_child(floor_display)


func _add_transition_box(
	node_name: String,
	position: Vector3,
	size: Vector3,
	material: Material,
) -> MeshInstance3D:
	var mesh := BoxMesh.new()
	mesh.size = size
	mesh.material = material
	var instance := MeshInstance3D.new()
	instance.name = node_name
	instance.mesh = mesh
	instance.position = position
	instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	elevator_transition_root.add_child(instance)
	return instance


func _send_elevator_destination_command(floor_number: int) -> void:
	elevator_transition_phase = "waiting_destination"
	_send_command("select_floor", {"floor": floor_number})


func _start_elevator_arrival(target: Vector3, message: Dictionary) -> void:
	elevator_transition_phase = "riding"
	var travel_height := clampf(
		2.4 + absf(float(elevator_destination_floor - elevator_origin_floor)) * 0.12,
		2.4,
		5.0,
	)
	var lift := Vector3(0.0, travel_height, 0.0)
	var tween := create_tween()
	tween.set_parallel(true)
	tween.tween_property(elevator_transition_root, "position", elevator_transition_root.position + lift, 0.7)
	tween.tween_property(player_root, "position", player_root.position + lift, 0.7)
	tween.set_parallel(false)
	tween.tween_interval(0.2)
	tween.tween_callback(_open_elevator_at_destination.bind(message))


func _open_elevator_at_destination(message: Dictionary) -> void:
	elevator_transition_phase = "opening"
	var tween := create_tween()
	tween.set_parallel(true)
	tween.tween_property(self, "camera_distance", elevator_return_camera_distance, 0.5)
	if elevator_transition_doors.size() == 2:
		tween.tween_property(elevator_transition_doors[0], "position:x", -0.72, 0.4)
		tween.tween_property(elevator_transition_doors[1], "position:x", 0.72, 0.4)
	tween.set_parallel(false)
	tween.tween_interval(0.15)
	tween.tween_callback(_finish_elevator_transition.bind(message))


func _finish_elevator_transition(message: Dictionary) -> void:
	if is_instance_valid(elevator_transition_root):
		elevator_transition_root.queue_free()
	elevator_transition_root = null
	elevator_transition_doors.clear()
	elevator_transition_active = false
	elevator_transition_phase = ""
	player_root.set_physics_process(true)
	last_room_id = ""
	_apply_snapshot(message)


func _build_staircase(position: Vector3, object_id: String) -> MeshInstance3D:
	var first_step: MeshInstance3D
	for step_index in range(10):
		var step := _add_box_to_dynamic(
			object_id + "-step-%02d" % step_index,
			position + Vector3(0.0, 0.12 + float(step_index) * 0.16, -float(step_index) * 0.28),
			Vector3(2.25, 0.24, 0.34),
			materials["metal"],
		)
		if step_index == 0:
			first_step = step
	for side in [-1.0, 1.0]:
		_add_box_to_dynamic(
			object_id + "-rail-%s" % str(side),
			position + Vector3(side * 1.18, 1.0, -1.28),
			Vector3(0.08, 1.85, 3.1),
			materials["wall_trim"],
		)
	return first_step


func _build_atm(position: Vector3, object_id: String) -> MeshInstance3D:
	var body := _add_box_to_dynamic(
		object_id,
		position + Vector3(0.0, 0.62, 0.0),
		Vector3(0.72, 1.24, 0.56),
		materials["metal"],
	)
	_add_box_to_dynamic(object_id + "-screen", position + Vector3(0.0, 1.02, 0.292), Vector3(0.42, 0.28, 0.035), materials["glass"])
	_add_box_to_dynamic(object_id + "-keypad", position + Vector3(0.19, 0.70, 0.30), Vector3(0.20, 0.17, 0.035), materials["wall_trim"])
	_add_box_to_dynamic(object_id + "-slot", position + Vector3(-0.12, 0.43, 0.30), Vector3(0.25, 0.045, 0.035), materials["lamp_glow"])
	return body


func _build_vending_machine(position: Vector3, object_id: String) -> MeshInstance3D:
	var body := _add_box_to_dynamic(
		object_id,
		position + Vector3(0.0, 0.94, 0.0),
		Vector3(0.92, 1.88, 0.62),
		materials["metal"],
	)
	_add_box_to_dynamic(object_id + "-glass", position + Vector3(-0.14, 1.08, 0.322), Vector3(0.55, 1.28, 0.035), materials["glass"])
	for row in range(3):
		for column in range(3):
			var x := -0.34 + float(column) * 0.18
			var y := 1.48 - float(row) * 0.34
			_add_box_to_dynamic(
				"%s-item-%d-%d" % [object_id, row, column],
				position + Vector3(x, y, 0.35),
				Vector3(0.10, 0.18, 0.08),
				materials["lamp_glow"] if (row + column) % 2 == 0 else materials["wall_trim"],
			)
	_add_box_to_dynamic(object_id + "-controls", position + Vector3(0.34, 1.10, 0.322), Vector3(0.12, 0.55, 0.04), materials["wall_trim"])
	return body


func _build_crt_terminal(position: Vector3, object_id: String) -> MeshInstance3D:
	var body := _add_box_to_dynamic(
		object_id + "-monitor",
		position + Vector3(0.0, 1.04, 0.0),
		Vector3(0.96, 0.72, 0.42),
		materials["metal"],
	)
	_add_box_to_dynamic(
		object_id + "-screen",
		position + Vector3(0.0, 1.06, 0.216),
		Vector3(0.76, 0.50, 0.018),
		materials["crt_screen"],
	)
	_add_box_to_dynamic(
		object_id + "-stand",
		position + Vector3(0.0, 0.62, -0.015),
		Vector3(0.24, 0.20, 0.24),
		materials["metal"],
	)
	_add_box_to_dynamic(
		object_id + "-keyboard",
		position + Vector3(0.0, 0.78, 0.37),
		Vector3(0.68, 0.06, 0.24),
		materials["wall_trim"],
	)
	return body


func _build_desk_lamp(position: Vector3, object_id: String) -> MeshInstance3D:
	var stem_mesh := CylinderMesh.new()
	stem_mesh.top_radius = 0.035
	stem_mesh.bottom_radius = 0.045
	stem_mesh.height = 0.38
	stem_mesh.material = materials["metal"]
	var stem := MeshInstance3D.new()
	stem.name = object_id + "-stem"
	stem.mesh = stem_mesh
	stem.position = position + Vector3(0.0, 0.91, 0.0)
	dynamic_root.add_child(stem)
	var shade := _add_box_to_dynamic(
		object_id + "-shade",
		position + Vector3(0.0, 1.14, 0.02),
		Vector3(0.28, 0.16, 0.25),
		materials["lamp_glow"],
	)
	var task_light := OmniLight3D.new()
	task_light.name = object_id + "-light"
	task_light.position = position + Vector3(0.0, 1.15, 0.06)
	task_light.light_color = Color("#ffd095")
	task_light.light_energy = 0.22
	task_light.omni_range = 2.4
	task_light.shadow_enabled = false
	dynamic_root.add_child(task_light)
	return shade


func _build_door_visual(position: Vector3, object_id: String) -> MeshInstance3D:
	var doorway_position := position + Vector3(0.0, 0.0, 0.84)
	var leaf := _add_box_to_dynamic(
		object_id + "-leaf",
		doorway_position + Vector3(0.0, 1.0, 0.0),
		Vector3(1.28, 1.95, 0.12),
		materials["door"],
	)
	_add_box_to_dynamic(
		object_id + "-window",
		doorway_position + Vector3(0.0, 1.52, 0.068),
		Vector3(0.58, 0.38, 0.018),
		materials["glass"],
	)
	_add_box_to_dynamic(
		object_id + "-handle",
		doorway_position + Vector3(0.43, 0.92, 0.085),
		Vector3(0.06, 0.13, 0.035),
		materials["metal"],
	)
	return leaf


func _build_elevator_visual(position: Vector3, object_id: String) -> MeshInstance3D:
	var opening_position := position + Vector3(0.0, 0.0, 0.18)
	_add_box_to_dynamic(
		object_id + "-backplate",
		opening_position + Vector3(0.0, 1.22, -0.16),
		Vector3(2.12, 2.56, 0.18),
		materials["wall"],
	)
	_add_box_to_dynamic(
		object_id + "-floor-indicator",
		opening_position + Vector3(0.0, 2.55, 0.06),
		Vector3(0.38, 0.16, 0.06),
		materials["crt_screen"],
	)
	_add_box_to_dynamic(
		object_id + "-frame-left",
		opening_position + Vector3(-0.84, 1.22, 0.0),
		Vector3(0.16, 2.44, 0.34),
		materials["wall_trim"],
	)
	_add_box_to_dynamic(
		object_id + "-frame-right",
		opening_position + Vector3(0.84, 1.22, 0.0),
		Vector3(0.16, 2.44, 0.34),
		materials["wall_trim"],
	)
	_add_box_to_dynamic(
		object_id + "-header",
		opening_position + Vector3(0.0, 2.36, 0.0),
		Vector3(1.84, 0.16, 0.34),
		materials["wall_trim"],
	)
	var elevator_door := _add_box_to_dynamic(
		object_id + "-left-door",
		opening_position + Vector3(-0.34, 1.12, 0.025),
		Vector3(0.66, 2.08, 0.14),
		materials["metal"],
	)
	_add_box_to_dynamic(
		object_id + "-right-door",
		opening_position + Vector3(0.34, 1.12, 0.025),
		Vector3(0.66, 2.08, 0.14),
		materials["metal"],
	)
	_add_box_to_dynamic(
		object_id + "-call-panel",
		opening_position + Vector3(1.02, 1.24, 0.02),
		Vector3(0.17, 0.45, 0.10),
		materials["metal"],
	)
	_add_box_to_dynamic(
		object_id + "-call-button",
		opening_position + Vector3(1.02, 1.34, 0.08),
		Vector3(0.07, 0.07, 0.035),
		materials["lamp_glow"],
	)
	return elevator_door


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
	var horizontal_velocity := Vector3(visual_player_velocity.x, 0.0, visual_player_velocity.z)
	var look_ahead := horizontal_velocity.limit_length(CAMERA_LOOK_AHEAD_MAX_SPEED) * CAMERA_LOOK_AHEAD_SECONDS
	var desired_target := visual_player_world + Vector3(0.0, 0.2, 0.0) + look_ahead
	var scene_data: Dictionary = snapshot.get("scene", {})
	var focus_world := Vector3.ZERO
	var focus_found := false
	var focus_value: Variant = scene_data.get("cameraFocusObjectId")
	var focus_id := "" if focus_value == null else str(focus_value)
	if not focus_id.is_empty():
		for item in scene_data.get("objects", []):
			var object: Dictionary = item
			if (
				str(object.get("id", "")) == focus_id
				and bool(object.get("cameraFocusEnabled", false))
			):
				focus_world = _pygame_to_world(
					float(object.get("displayX", object.get("x", 0))),
					float(object.get("displayY", object.get("y", 0))),
				)
				focus_found = true
				break
	var focus_blend_target := 1.0 if focus_found else 0.0
	camera_focus_amount = lerpf(
		camera_focus_amount,
		focus_blend_target,
		1.0 - exp(-CAMERA_FOLLOW_RESPONSE * delta),
	)
	if focus_found:
		desired_target = desired_target.lerp(
			focus_world + Vector3(0.0, 0.55, 0.0),
			camera_focus_amount,
		)
	var effective_camera_distance := lerpf(
		camera_distance,
		CAMERA_DISTANCE_MIN,
		camera_focus_amount,
	)
	var offset := Vector3(
		effective_camera_distance * 0.72,
		effective_camera_distance * 1.02,
		effective_camera_distance * 0.72,
	)
	var desired_position := desired_target + offset
	if visual_player_ready and not camera_has_tracking_target:
		camera_target = desired_target
		camera.position = desired_position
		camera_has_tracking_target = true
	elif camera_has_tracking_target:
		var follow_blend := 1.0 - exp(-CAMERA_FOLLOW_RESPONSE * delta)
		camera_target = camera_target.lerp(desired_target, follow_blend)
		camera.position = camera.position.lerp(desired_target + offset, follow_blend)
	else:
		camera_target = desired_target
		camera.position = desired_position
	var desired_size: float = clampf(
		CAMERA_ORTHO_SIZE_BASE + (effective_camera_distance - 14.0) * 0.55,
		CAMERA_ORTHO_SIZE_MIN,
		CAMERA_ORTHO_SIZE_MAX,
	)
	var zoom_blend := 1.0 - exp(-CAMERA_ZOOM_RESPONSE * delta)
	camera.size = lerpf(camera.size, desired_size, zoom_blend)
	camera.look_at(camera_target, Vector3.UP)


func _update_art_motion(delta: float) -> void:
	# These accents are renderer-only. Pygame remains the authority for all
	# positions and interactions; this layer adds a tactile 2.5D presentation.
	if lobby_light:
		lobby_light.light_energy = 1.42 + sin(animation_clock * 1.7) * 0.06
	if rim_light:
		rim_light.light_energy = 0.77 + sin(animation_clock * 1.1 + 0.8) * 0.05
	for index in range(interaction_rings.size()):
		var ring := interaction_rings[index]
		if not is_instance_valid(ring):
			continue
		var pulse := (sin(animation_clock * 3.4 + float(index) * 0.7) + 1.0) * 0.5
		var scale_value := 0.82 + pulse * 0.2
		ring.scale = Vector3(scale_value, 1.0, scale_value)
		ring.rotation.y += delta * (0.55 + pulse * 0.25)


func _update_hud() -> void:
	status_label.text = connection_status
	var scene_data: Dictionary = snapshot.get("scene", {})
	var office: Dictionary = snapshot.get("office", {})
	var room_id := str(scene_data.get("room", "waiting for bridge"))
	room_label.text = "FLOOR %02d  ·  %s" % [int(scene_data.get("floor", 1)), room_id.to_upper()]
	var maintenance_status := _nearby_maintenance_status(scene_data)
	if not maintenance_status.is_empty():
		var cleanliness := int(maintenance_status.get("cleanliness", 0))
		var condition := int(maintenance_status.get("condition", 0))
		var target_name := str(maintenance_status.get("label", "OBJECT"))
		var active_work: Variant = maintenance_status.get("activeWork", null)
		if active_work is Dictionary:
			var work_action := str(active_work.get("action", "clean")).to_upper()
			var progress := clampi(roundi(float(active_work.get("progress", 0.0)) * 100.0), 0, 100)
			var reward := int(active_work.get("rewardFiat", 0))
			var payer := str(active_work.get("payer", "RECEPTIONIST"))
			var progress_blocks := int(round(float(progress) / 10.0))
			var progress_bar := "■".repeat(progress_blocks) + "□".repeat(10 - progress_blocks)
			if bool(active_work.get("waitingForPayment", false)):
				controls_label.text = "WORK COMPLETE / WAITING FOR PAYMENT\n%s WILL PAY ƒ%d  ·  %s" % [
					payer,
					reward,
					target_name,
				]
			else:
				controls_label.text = "%s  %s%%  %s\nSTAY WITHIN REACH  ·  %s" % [
					work_action,
					str(progress).pad_zeros(3),
					progress_bar,
					("%s PAYS ƒ%d" % [payer, reward]) if reward > 0 else target_name,
				]
		else:
			var public_work: Variant = maintenance_status.get("maintenanceWork", maintenance_status.get("publicWork", {}))
			var clean_hint := "C CLEAN %d%%" % cleanliness
			var repair_hint := "V REPAIR %d%%" % condition
			if public_work is Dictionary:
				if bool(public_work.get("cleanAvailable", false)):
					clean_hint = "C CLEAN / ƒ%d" % int(public_work.get("cleanRewardFiat", 0))
				if bool(public_work.get("repairAvailable", false)):
					repair_hint = "V REPAIR / ƒ%d" % int(public_work.get("repairRewardFiat", 0))
			controls_label.text = "WASD MOVE  ·  SHIFT SPRINT  ·  SPACE JUMP\n%s  ·  %s  ·  %s" % [
				clean_hint,
				repair_hint,
				target_name,
			]
		var worst_state := mini(cleanliness, condition)
		var state_color := Color("#c4ddcb")
		if worst_state < 35:
			state_color = Color("#ef7f70")
		elif worst_state < 65:
			state_color = Color("#f8b957")
		controls_label.add_theme_color_override("font_color", state_color)
	else:
		controls_label.text = "WASD MOVE  ·  SHIFT SPRINT  ·  SPACE JUMP\nE USE / STAIRS  ·  C CLEAN  ·  V REPAIR"
		controls_label.add_theme_color_override("font_color", Color("#c4ddcb"))
	var navigation: Dictionary = scene_data.get("navigation", {})
	mission_label.text = "MISSION  ·  " + str(navigation.get("mission", "Connect to Pygame to receive the room mission."))
	notice_label.text = "ƒ%.2f  ·  %s" % [float(office.get("funds", 0.0)), str(office.get("notice", "WAITING FOR PYGAME"))]
	_update_native_app_panel(office, scene_data)


func _nearby_maintenance_status(scene_data: Dictionary) -> Dictionary:
	var raw_objects: Variant = scene_data.get("objects", [])
	if not raw_objects is Array:
		return {}
	for value in raw_objects:
		if not value is Dictionary:
			continue
		var object: Dictionary = value
		if not bool(object.get("nearby", false)):
			continue
		var cleanliness: Variant = object.get("cleanliness")
		var condition: Variant = object.get("condition")
		if typeof(cleanliness) != TYPE_INT or typeof(condition) != TYPE_INT:
			continue
		var label := str(object.get("label", "OBJECT")).strip_edges().to_upper()
		if label.length() > 18:
			label = label.substr(0, 17) + "…"
		return {
			"label": label,
			"cleanliness": clampi(int(cleanliness), 0, 100),
			"condition": clampi(int(condition), 0, 100),
			"publicWork": object.get("publicWork", {}),
			"activeWork": object.get("activeWork", null),
		}
	return {}


func _update_native_app_panel(office: Dictionary, scene_data: Dictionary) -> void:
	if native_app_panel == null:
		return
	var page := _active_page_name()
	native_app_panel.visible = not page.is_empty()
	if page.is_empty():
		return

	var page_source_value: Variant = office.get("pageSource")
	var page_source := "" if page_source_value == null else str(page_source_value)
	var workers: Array = office.get("workers", [])
	var location := "FLOOR %02d  /  %s" % [
		int(scene_data.get("floor", 1)),
		str(scene_data.get("room", "UNKNOWN")).replace("_", " ").to_upper(),
	]
	match page:
		"phone":
			native_app_title.text = "TOWER PAY PHONE"
			native_app_body.text = "CALLL HOME\nCOMMS\n\nThis line is limited to those two services. The game screen is read-only in this pass."
			native_app_footer.text = "CALLS AND MESSAGES ARE NOT STARTED HERE  ·  ESC CLOSE"
		"systems":
			native_app_title.text = "SALARYMAN OS  /  SYSTEMS TERMINAL"
			native_app_body.text = "CONNECTED GAME MODULES\n%s\nTEAM  %d  ·  GAME FIAT  ƒ%.2f\n\nJOB COMMAND  ·  ACCOUNTING  ·  CONTACTS\nMARKETING  ·  DARKROOM  ·  INTELLIGENCE REPORTS" % [
				location,
				workers.size(),
				float(office.get("funds", 0.0)),
			]
			native_app_footer.text = "GAME-NATIVE WORKSPACE  ·  READ-ONLY DATA  ·  ESC CLOSE"
		"economy":
			native_app_title.text = "BANCO OMBRA"
			native_app_body.text = "%s\nGAME FIAT  ƒ%.2f\n\nThis is the Tower game wallet view. No transfer or payout is initiated from this screen." % [
				location,
				float(office.get("funds", 0.0)),
			]
			native_app_footer.text = "READ-ONLY  ·  ESC CLOSE"
		"automation":
			native_app_title.text = "AUTOMATION  /  " + page_source.to_upper()
			native_app_body.text = "LIVE STATUS IS SHARED WITH THE GAME CLIENT.\nMovement in the Tower represents the selected automation coworker; this view does not start external work."
			native_app_footer.text = "READ-ONLY GAME MODULE  ·  ESC CLOSE"
		"tools":
			native_app_title.text = "OFFICE MAINTENANCE"
			native_app_body.text = "This game panel is read-only. It does not start cleaning or repair work."
			native_app_footer.text = "READ-ONLY  ·  ESC CLOSE"
		"customize":
			native_app_title.text = "ROOM CUSTOMIZATION"
			native_app_body.text = "Room finishes and decor are part of the game world. Editing is disabled in this read-only view."
			native_app_footer.text = "READ-ONLY  ·  ESC CLOSE"
		_:
			native_app_title.text = page_source.to_upper() if not page_source.is_empty() else page.to_upper()
			native_app_body.text = location + "\n\nThis view is rendered by the game client."
			native_app_footer.text = "ESC CLOSE"


func _active_page_name() -> String:
	var office: Dictionary = snapshot.get("office", {})
	var page_value: Variant = office.get("activePage")
	return "" if page_value == null else str(page_value)


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
		if _handle_elevator_picker_key(event.keycode):
			get_viewport().set_input_as_handled()
			return
		if not _active_page_name().is_empty():
			if event.keycode == KEY_ESCAPE:
				_send_command("close_page")
			get_viewport().set_input_as_handled()
			return
		if elevator_transition_active:
			get_viewport().set_input_as_handled()
			return
		match event.keycode:
			KEY_E:
				var nearby_kind := _nearby_object_kind()
				if nearby_kind == "elevator":
					_open_elevator_floor_picker()
				elif nearby_kind == "stairs":
					_send_command("climb_stairs")
				else:
					_send_command("interact")
			KEY_C:
				_send_command("maintain", {"action": "clean"})
			KEY_V:
				_send_command("maintain", {"action": "repair"})
			KEY_SPACE:
				player_root.try_jump()
			KEY_F:
				player_root.try_fight()
			KEY_Q:
				player_root.try_sweep()
			KEY_P:
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
		if native_app_panel != null and native_app_panel.visible:
			get_viewport().set_input_as_handled()
			return
		if elevator_transition_active or (
			elevator_floor_panel != null and elevator_floor_panel.visible
		):
			get_viewport().set_input_as_handled()
			return
		if event.button_index == MOUSE_BUTTON_LEFT:
			player_root.try_fight()
		elif event.button_index == MOUSE_BUTTON_RIGHT:
			player_root.try_sweep()
		elif event.button_index == MOUSE_BUTTON_WHEEL_UP:
			camera_distance = max(CAMERA_DISTANCE_MIN, camera_distance - 1.5)
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			camera_distance = min(CAMERA_DISTANCE_MAX, camera_distance + 1.5)


func _send_current_input() -> void:
	if (
		not _active_page_name().is_empty()
		or elevator_transition_active
		or (
		elevator_floor_panel != null and elevator_floor_panel.visible
		)
	):
		_send_command("set_input", {"x": 0.0, "y": 0.0, "sprint": false})
		return
	var movement := player_root.requested_movement()
	_send_command(
		"set_input",
		{"x": movement.x, "y": movement.y, "sprint": player_root.wants_sprint()},
	)