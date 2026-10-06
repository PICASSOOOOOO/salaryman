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
const WORLD_ORIGIN_REBASE_THRESHOLD := 1_000_000.0
const LOBBY_RENDER_ANCHOR_PX := Vector2i(2250, 2200)
const FLOOR_HEIGHT := 0.08
const WALL_HEIGHT := 1.65
const CAMERA_DISTANCE_MIN := 8.0
const CAMERA_DISTANCE_MAX := 22.0
const CAMERA_ORTHO_SIZE_MIN := 9.0
const CAMERA_ORTHO_SIZE_MAX := 18.0
const CAMERA_ORTHO_SIZE_BASE := 13.0
const CAMERA_FOLLOW_RESPONSE := 5.0
const CAMERA_ZOOM_RESPONSE := 6.0
const CAMERA_LOOK_AHEAD_SECONDS := 0.18
const CAMERA_LOOK_AHEAD_MAX_SPEED := 3.2
const PLAYER_RENDER_HEIGHT := 1.55
# Room floors are 0.16 units above the world origin (0.08 center + 0.08
# half-height). Keep the player root on that same surface; the imported
# character's feet are authored at its local origin.
const PLAYER_GROUND_Y := FLOOR_HEIGHT + 0.08

var connection := StreamPeerTCP.new()
var receive_buffer := ""
var snapshot: Dictionary = {}
var connection_status := "connecting to Pygame…"
var command_sequence := 0
var visual_player_world := Vector3(0.0, PLAYER_GROUND_Y, 0.0)
var visual_player_ready := false
var target_player_world := Vector3.ZERO
var visual_player_velocity := Vector3.ZERO
var animation_clock := 0.0
var player_pose_blend := 0.0
var camera_distance := 12.0
var last_room_id := ""
var last_sequence := -1
var lobby_light: OmniLight3D
var rim_light: OmniLight3D
var interaction_rings: Array[MeshInstance3D] = []

var world_root: Node3D
var dynamic_root: Node3D
var automation_root: Node3D
var player_root: Node3D
var player_sprite: Sprite3D
var camera: Camera3D
var camera_has_tracking_target := false
var interface_root: Control
var warm_lamp_light: OmniLight3D
var lobby_render_origin_px := Vector2i.ZERO
var status_label: Label
var room_label: Label
var mission_label: Label
var notice_label: Label
var camera_target := Vector3.ZERO

var materials: Dictionary = {}
var imported_scenes: Dictionary = {}
var shadow_tower_textures: Dictionary = {}
var pixel_character_textures: Dictionary = {}
var automation_actors: Dictionary = {}
var automation_sprites: Dictionary = {}
var automation_targets: Dictionary = {}
var player_facing_row := 0
var player_facing_left := false


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
	automation_root.name = "PygameAutomationCharacters"
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
	_add_box("%sFloor" % room_id, center, size, materials[spec["material"]])

	var left := float(render_position_px.x) * WORLD_SCALE
	var right := float(render_position_px.x + rect_size_px.x) * WORLD_SCALE
	var top := float(render_position_px.y) * WORLD_SCALE
	var bottom := float(render_position_px.y + rect_size_px.y) * WORLD_SCALE
	var wall_thickness := 0.26
	_add_box("%sWallLeft" % room_id, Vector3(left, WALL_HEIGHT / 2.0, (top + bottom) / 2.0), Vector3(wall_thickness, WALL_HEIGHT, float(rect_size_px.y) * WORLD_SCALE), materials["wall"])
	_add_box("%sWallRight" % room_id, Vector3(right, WALL_HEIGHT / 2.0, (top + bottom) / 2.0), Vector3(wall_thickness, WALL_HEIGHT, float(rect_size_px.y) * WORLD_SCALE), materials["wall"])

	if room_id == "recreation":
		var door_centers: Array = []
		for door_x in floor_plan["officeDoorCenters"]:
			door_centers.append(float(door_x) * WORLD_SCALE)
		_add_horizontal_wall_segments("%sWallBottom" % room_id, left, right, bottom, door_centers, 1.55)
	elif room_id == "lobby":
		_add_box("%sWallTop" % room_id, Vector3((left + right) / 2.0, WALL_HEIGHT / 2.0, top), Vector3(float(rect_size_px.x) * WORLD_SCALE, WALL_HEIGHT, wall_thickness), materials["wall"])
		_add_horizontal_wall_segments("%sWallBottom" % room_id, left, right, bottom, [float(floor_plan["lobbyHallwayOpening"]) * WORLD_SCALE], 1.8)
	elif room_id.begins_with("office") or room_id == "executive" or room_id == "public":
		_add_box("%sBackWall" % room_id, Vector3((left + right) / 2.0, WALL_HEIGHT / 2.0, bottom), Vector3(float(rect_size_px.x) * WORLD_SCALE, WALL_HEIGHT, wall_thickness), materials["wall"])
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
		var frame_width := 0.13
		var frame_depth := 0.34
		var frame_height := 0.18
		_add_box("%sFrameLeft%d" % [node_prefix, int(center * 100.0)], Vector3(opening_left + frame_width / 2.0, WALL_HEIGHT / 2.0, z), Vector3(frame_width, WALL_HEIGHT, frame_depth), materials["wall_trim"])
		_add_box("%sFrameRight%d" % [node_prefix, int(center * 100.0)], Vector3(opening_right - frame_width / 2.0, WALL_HEIGHT / 2.0, z), Vector3(frame_width, WALL_HEIGHT, frame_depth), materials["wall_trim"])
		_add_box("%sFrameHeader%d" % [node_prefix, int(center * 100.0)], Vector3(center, WALL_HEIGHT - frame_height / 2.0, z), Vector3(opening_width, frame_height, frame_depth), materials["wall_trim"])
		cursor = opening_right
	if cursor < right:
		_add_box("%sEnd" % node_prefix, Vector3((cursor + right) / 2.0, WALL_HEIGHT / 2.0, z), Vector3(right - cursor, WALL_HEIGHT, 0.26), materials["wall"])


func _build_static_furniture() -> void:
	imported_scenes["table"] = load("res://agentshire-assets/furniture/table_medium.gltf")
	imported_scenes["chair"] = load("res://agentshire-assets/furniture/chair_A.gltf")
	imported_scenes["couch"] = load("res://agentshire-assets/furniture/couch.gltf")
	imported_scenes["lamp"] = load("res://agentshire-assets/furniture/lamp_standing.gltf")
	shadow_tower_textures["atm"] = _load_shadow_tower_texture("atm")
	shadow_tower_textures["vending"] = _load_shadow_tower_texture("vending")
	shadow_tower_textures["desk-terminal"] = _load_shadow_tower_texture("desk-terminal")

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


func _load_shadow_tower_texture(asset_name: String) -> Texture2D:
	var texture := load("res://shadow-tower-assets/%s.png" % asset_name) as Texture2D
	if texture == null:
		push_error("Could not load Shadow Tower asset: %s.png" % asset_name)
	return texture


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
	player_root = Node3D.new()
	player_root.name = "AuthoritativePlayer"
	world_root.add_child(player_root)
	var texture := _load_pixel_character_texture("characters/char_0.png")
	if texture == null:
		push_error("Missing Pygame player sprite sheet: characters/char_0.png")
		return
	player_sprite = _new_pixel_character_sprite(texture, 0, PLAYER_RENDER_HEIGHT)
	player_sprite.name = "PlayerPixelSprite"
	player_sprite.position = Vector3(0.0, PLAYER_RENDER_HEIGHT / 2.0, 0.0)
	player_root.add_child(player_sprite)
	_add_character_shadow(player_root, 0.38)


func _load_pixel_character_texture(sprite_path: String) -> Texture2D:
	var file_name := sprite_path.get_file()
	if file_name not in ["char_0.png", "char_1.png", "char_2.png", "char_3.png", "char_4.png", "char_5.png"]:
		push_error("Unsupported Pygame character sprite: %s" % sprite_path)
		return null
	if pixel_character_textures.has(file_name):
		return pixel_character_textures[file_name] as Texture2D
	var texture := load("res://pixel-agents/assets/characters/%s" % file_name) as Texture2D
	if texture == null:
		push_error("Could not load Pygame character sprite: %s" % file_name)
		return null
	pixel_character_textures[file_name] = texture
	return texture


func _new_pixel_character_sprite(texture: Texture2D, identity_variant: int, height: float) -> Sprite3D:
	var sprite := Sprite3D.new()
	sprite.texture = texture
	sprite.hframes = 7
	sprite.vframes = 3
	sprite.frame = clampi(identity_variant, 0, 6)
	sprite.pixel_size = height / 32.0
	sprite.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
	sprite.billboard = BaseMaterial3D.BILLBOARD_FIXED_Y
	sprite.shaded = false
	sprite.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return sprite


func _set_pixel_character_facing(sprite: Sprite3D, facing: String, identity_variant: int) -> void:
	if sprite == null:
		return
	var row := 0
	match facing:
		"up":
			row = 1
		"left", "right":
			row = 2
		_:
			row = 0
	sprite.frame = row * 7 + clampi(identity_variant, 0, 6)
	sprite.flip_h = facing == "left"


func _add_character_shadow(parent: Node3D, radius: float) -> void:
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


func _current_player_action() -> String:
	var scene_data: Dictionary = snapshot.get("scene", {})
	var player: Dictionary = scene_data.get("player", {})
	return str(player.get("action", "stand"))


func _sync_automation_characters(characters: Array) -> void:
	var active_domains: Dictionary = {}
	for index in range(characters.size()):
		var character: Dictionary = characters[index]
		var domain := str(character.get("domain", ""))
		if domain.is_empty():
			continue
		active_domains[domain] = true
		var identity_variant := int(abs(hash(domain)) % 7)
		var target := _pygame_to_world(float(character.get("x", 0)), float(character.get("y", 0)))
		var actor_root: Node3D = automation_actors.get(domain)
		var sprite: Sprite3D = automation_sprites.get(domain)
		if actor_root == null or not is_instance_valid(actor_root):
			var texture := _load_pixel_character_texture(str(character.get("sprite", "characters/char_0.png")))
			if texture == null:
				continue
			actor_root = Node3D.new()
			actor_root.name = "Automation-" + domain
			actor_root.position = target
			sprite = _new_pixel_character_sprite(texture, identity_variant, 1.42)
			sprite.name = "PixelSprite"
			sprite.position = Vector3(0.0, 0.71, 0.0)
			actor_root.add_child(sprite)
			_add_character_shadow(actor_root, 0.34)

			var name_tag := Label3D.new()
			name_tag.name = "NameTag"
			name_tag.text = str(character.get("name", domain)).to_upper()
			name_tag.font_size = 24
			name_tag.pixel_size = 0.006
			name_tag.position = Vector3(0.0, 1.62, 0.0)
			name_tag.billboard = BaseMaterial3D.BILLBOARD_ENABLED
			name_tag.outline_size = 7
			name_tag.outline_modulate = Color("#14211e")
			var accent: Array = character.get("accent", [])
			if accent.size() >= 3:
				name_tag.modulate = Color8(int(accent[0]), int(accent[1]), int(accent[2]))
			actor_root.add_child(name_tag)
			automation_root.add_child(actor_root)
			automation_actors[domain] = actor_root
			automation_sprites[domain] = sprite
		automation_targets[domain] = target
		var facing := str(character.get("facing", "down"))
		_set_pixel_character_facing(sprite, facing, identity_variant)

	for domain in automation_actors.keys():
		if active_domains.has(domain):
			continue
		var stale_root: Node3D = automation_actors[domain]
		if is_instance_valid(stale_root):
			stale_root.queue_free()
		automation_actors.erase(domain)
		automation_sprites.erase(domain)
		automation_targets.erase(domain)


func _smooth_automation_characters(delta: float) -> void:
	for domain in automation_actors.keys():
		var actor_root: Node3D = automation_actors.get(domain)
		var sprite: Sprite3D = automation_sprites.get(domain)
		if actor_root == null or sprite == null or not is_instance_valid(actor_root) or not is_instance_valid(sprite):
			continue
		var target: Vector3 = automation_targets.get(domain, actor_root.position)
		var blend := 1.0 - exp(-10.0 * delta)
		actor_root.position = actor_root.position.lerp(target, blend)
		var moving := actor_root.position.distance_to(target) > 0.035
		var phase := float(abs(hash(str(domain))) % 17) * 0.24
		var bob := absf(sin(animation_clock * 8.5 + phase)) * 0.035 if moving else sin(animation_clock * 1.6 + phase) * 0.008
		sprite.position.y = 0.71 + bob


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
	_sync_automation_characters(scene_data.get("automationCharacters", []))


func _pygame_to_world(x: float, y: float) -> Vector3:
	var render_position_px := Vector2i(roundi(x), roundi(y))
	if maxf(absf(x), absf(y)) >= WORLD_ORIGIN_REBASE_THRESHOLD:
		# The lobby uses large Pygame world coordinates. Rebase only the view;
		# snapshots and all commands remain in Pygame's authoritative space.
		render_position_px -= lobby_render_origin_px
	return Vector3(float(render_position_px.x) * WORLD_SCALE, PLAYER_GROUND_Y, float(render_position_px.y) * WORLD_SCALE)


func _smooth_visual_player(delta: float) -> void:
	if not visual_player_ready:
		return
	var previous_position := visual_player_world
	visual_player_world = visual_player_world.lerp(target_player_world, min(1.0, delta * 14.0))
	if delta > 0.0:
		var measured_velocity := (visual_player_world - previous_position) / delta
		var velocity_blend := 1.0 - exp(-delta * 8.0)
		visual_player_velocity = visual_player_velocity.lerp(measured_velocity, velocity_blend)
	if player_root:
		# Pygame owns the authoritative position. This renderer-only layer adds a
		# small sit-down settle and quiet breathing without changing gameplay state.
		var target_pose_blend := 1.0 if _current_player_action() == "sit" else 0.0
		player_pose_blend = move_toward(player_pose_blend, target_pose_blend, delta * 7.5)
		var eased_blend := player_pose_blend * player_pose_blend * (3.0 - 2.0 * player_pose_blend)
		var breathing := sin(animation_clock * 1.8) * 0.012 + sin(animation_clock * 0.9 + 0.4) * 0.006
		player_root.position = visual_player_world + Vector3(0.0, (-0.26 + breathing) * eased_blend, 0.0)
		player_root.rotation = Vector3(
			-0.16 * eased_blend,
			sin(animation_clock * 0.75) * 0.018 * eased_blend,
			sin(animation_clock * 1.15 + 0.5) * 0.012 * eased_blend,
		)
		if player_sprite:
			var height_scale := lerpf(1.0, 0.72, eased_blend)
			var moving := visual_player_velocity.length() > 0.08 and _current_player_action() == "stand"
			var bob := absf(sin(animation_clock * 9.0)) * 0.04 if moving else sin(animation_clock * 1.7) * 0.008
			player_sprite.scale = Vector3(1.0, height_scale, 1.0)
			player_sprite.position = Vector3(0.0, PLAYER_RENDER_HEIGHT * height_scale / 2.0 + bob, 0.0)
	_smooth_automation_characters(delta)


func _rebuild_bridge_objects(objects: Array) -> void:
	for child in dynamic_root.get_children():
		child.queue_free()
	interaction_rings.clear()
	var has_owner_terminal_art: bool = shadow_tower_textures.get("desk-terminal") is Texture2D
	for item in objects:
		var object: Dictionary = item
		var position := _pygame_to_world(float(object.get("x", 0)), float(object.get("y", 0)))
		var kind := str(object.get("kind", ""))
		var object_id := str(object.get("id", "bridge-object"))
		var render_position := _pygame_to_world(
			float(object.get("displayX", object.get("x", 0))),
			float(object.get("displayY", object.get("y", 0))),
		)
		var owner_terminal_replaces_object := has_owner_terminal_art and (
			object_id == "executive-desk" or object_id == "executive-telephone"
		)
		if not owner_terminal_replaces_object:
			var marker := _build_bridge_object(kind, render_position, object_id)
			marker.name = object_id
		if bool(object.get("nearby", false)):
			_add_interaction_ring(position)


func _build_bridge_object(kind: String, position: Vector3, object_id: String) -> Node3D:
	if kind == "atm" and shadow_tower_textures.get("atm") is Texture2D:
		return _add_shadow_tower_sprite_to_dynamic(
			"ATM",
			shadow_tower_textures["atm"],
			position,
			1.8,
		)
	if kind == "vending_machine" and shadow_tower_textures.get("vending") is Texture2D:
		return _add_shadow_tower_sprite_to_dynamic(
			"VendingMachine",
			shadow_tower_textures["vending"],
			position,
			1.9,
		)
	if kind == "crt_terminal" and object_id == "executive-crt" and shadow_tower_textures.get("desk-terminal") is Texture2D:
		return _add_shadow_tower_sprite_to_dynamic(
			"OwnerDeskTerminal",
			shadow_tower_textures["desk-terminal"],
			position,
			3.4,
		)
	if kind == "crt_terminal":
		return _build_crt_terminal(position, object_id)
	if kind == "desk_lamp":
		return _build_desk_lamp(position, object_id)
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
		return _add_box_to_dynamic("Circulation", position + Vector3(0, 0.55, 0), Vector3(1.6, 1.1, 1.4), materials["metal"])
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


func _add_shadow_tower_sprite_to_dynamic(
	node_name: String,
	texture: Texture2D,
	position: Vector3,
	target_width: float,
) -> Sprite3D:
	var sprite := Sprite3D.new()
	sprite.name = node_name
	sprite.texture = texture
	sprite.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
	sprite.billboard = BaseMaterial3D.BILLBOARD_FIXED_Y
	sprite.shaded = false
	sprite.pixel_size = target_width / float(texture.get_width())
	var rendered_height := sprite.pixel_size * float(texture.get_height())
	sprite.position = position + Vector3(0.0, rendered_height / 2.0, 0.0)
	sprite.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	dynamic_root.add_child(sprite)
	return sprite


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
	var offset := Vector3(camera_distance * 0.72, camera_distance * 1.02, camera_distance * 0.72)
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
		CAMERA_ORTHO_SIZE_BASE + (camera_distance - 14.0) * 0.55,
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


func _update_player_animation() -> void:
	if player_sprite == null or visual_player_velocity.length() <= 0.08:
		return
	if absf(visual_player_velocity.x) > absf(visual_player_velocity.z):
		player_facing_row = 2
		player_facing_left = visual_player_velocity.x < 0.0
	else:
		player_facing_row = 1 if visual_player_velocity.z < 0.0 else 0
		player_facing_left = false
	player_sprite.frame = player_facing_row * 7
	player_sprite.flip_h = player_facing_left


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