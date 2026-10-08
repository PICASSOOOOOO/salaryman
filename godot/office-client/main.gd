extends Node3D

## Godot game client for the Python office simulation.
##
## Godot owns real-time movement, collision, and animation. Python retains the
## office simulation, interactions, finance, and persistent state.

const PROTOCOL_VERSION := 1
const PlayerController = preload("res://player_controller.gd")
const OfficeProp = preload("res://office_prop.gd")
const ServiceProp = preload("res://office_service_prop.gd")
const TowerExteriorWorld = preload("res://exterior_world.gd")
const HOST := "127.0.0.1"
const PORT := 4242
const WORLD_SCALE := 0.01
const WORLD_ORIGIN_REBASE_THRESHOLD := 1_000_000.0
const FLOOR_HEIGHT := 0.08
const WALL_HEIGHT := 2.7
const CAMERA_DISTANCE_MIN := 8.0
const CAMERA_DISTANCE_MAX := 22.0
const DANGER_AUDIO_TRACK_IDS: Array[int] = [11, 17]
const CAMERA_DISTANCE_LEVELS := [8.0, 13.0, 21.0]
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
var camera_distance := 13.0
var camera_zoom_index := 1
var camera_sfx: Node
var last_room_id := ""
var last_floor_number := -1
var last_sequence := -1
var lobby_light: OmniLight3D
var rim_light: OmniLight3D
var interaction_rings: Array[MeshInstance3D] = []

var world_root: Node3D
var dynamic_root: Node3D
var automation_root: Node3D
var basement_actor_root: Node3D
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
var elevator_floor_status_label: Label
var native_app_panel: ColorRect
var native_app_title: Label
var native_app_body: Label
var native_app_footer: Label
var last_native_app_page := ""
var ghost_dialogue_line := ""
var selected_elevator_floor := 1
var elevator_wait_remaining := 0.0
var elevator_command_id := ""
var transient_notice_text := ""
var transient_notice_remaining := 0.0
var elevator_transition_active := false
var elevator_transition_phase := ""
var elevator_origin_floor := 1
var elevator_destination_floor := 1
var elevator_origin_room := ""
var elevator_destination_room := ""
var elevator_return_camera_distance := 12.0
var elevator_transition_root: Node3D
var elevator_transition_doors: Array[MeshInstance3D] = []
var elevator_transition_fog_panels: Array[MeshInstance3D] = []
var elevator_transition_fog_material: StandardMaterial3D

var materials: Dictionary = {}
var floor_plan_data: Dictionary = {}
var imported_scenes: Dictionary = {}
var automation_actors: Dictionary = {}
var automation_animations: Dictionary = {}
var automation_targets: Dictionary = {}
var basement_actor_nodes: Dictionary = {}
var danger_audio_rng := RandomNumberGenerator.new()
var danger_audio_player: AudioStreamPlayer
var danger_audio_silence_seconds := 0.0
var danger_audio_current_track := -1
var temple_music_player: AudioStreamPlayer
var temple_music_enabled := false
var temple_music_frame := 0
const TEMPLE_MIX_RATE := 22050.0
var structural_wall_thickness := 0.3
var wall_service_cavity := 0.12


func _ready() -> void:
	_build_materials()
	_build_lighting()
	danger_audio_rng.randomize()
	danger_audio_player = AudioStreamPlayer.new()
	danger_audio_player.name = "BasementDangerAudio"
	danger_audio_player.volume_db = -45.0
	add_child(danger_audio_player)
	_setup_temple_music()
	camera_sfx = preload("res://camera_sfx.gd").new()
	camera_sfx.name = "CameraSfx"
	add_child(camera_sfx)
	_build_building_shell()
	_build_static_furniture()
	_build_interface()
	_load_player()
	_connect_to_pygame()


func _build_materials() -> void:
	materials["floor"] = _material(Color("#d4b98b"), 0.92)
	materials["hall_floor"] = _material(Color("#415965"), 0.84)
	materials["temple_floor"] = _material(Color("#9baa87"), 0.92)
	materials["construction_floor"] = _material(Color("#70685b"), 0.96)
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
	materials["wall_service"] = _material(Color("#777e72"), 0.58, false, 0.12)
	materials["foundation"] = _material(Color("#48534f"), 0.9)
	materials["wall_trim"] = _material(Color("#2f8f82"), 0.62)
	materials["door"] = _material(Color("#e8b45d"), 0.66)
	materials["door_glass"] = _material(Color(0.63, 0.72, 0.66, 0.50), 0.58, true)
	materials["glass"] = _material(Color("#8ed6d2"), 0.18, true)
	# Facade shells for many Tower floors share one render elevation, so their
	# transparent panes overlap. Keep each pane lightly tinted to avoid hiding
	# the exterior through stacked windows.
	materials["window_glass"] = _material(Color(0.55, 0.83, 0.80, 0.025), 0.18, true)
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
	world_root.name = "ShadowTower"
	add_child(world_root)

	dynamic_root = Node3D.new()
	dynamic_root.name = "BridgeObjects"
	world_root.add_child(dynamic_root)

	automation_root = Node3D.new()
	automation_root.name = "AutomationCharacters"
	world_root.add_child(automation_root)

	basement_actor_root = Node3D.new()
	basement_actor_root.name = "BasementPestsAndCrew"
	world_root.add_child(basement_actor_root)

	floor_plan_data = _load_floor_plan()
	var floor_plan := floor_plan_data
	var base_layout: Dictionary = floor_plan.get("baseLayout", {})
	var structure: Dictionary = base_layout.get("structure", {})
	structural_wall_thickness = maxf(float(structure.get("wallThicknessMeters", 0.3)), 0.12)
	wall_service_cavity = clampf(
		float(structure.get("wallServiceCavityMeters", 0.12)),
		0.0,
		structural_wall_thickness * 0.6
	)
	var elevator_lobby: Dictionary = base_layout.get("elevatorLobby", {})
	var lobby_bounds: Array = elevator_lobby.get("bounds", [])
	var standard_hallways: Array = base_layout.get("hallways", [])
	if lobby_bounds.size() >= 4 and not standard_hallways.is_empty():
		var main_hall: Array = standard_hallways[0]
		lobby_render_origin_px = lobby_render_origin_from_plan(
			lobby_bounds,
			main_hall,
			int(floor_plan.get("lobbyHallwayOpening", 0)),
		)
	var room_specs: Array = []
	for room_data in floor_plan["rooms"]:
		var bounds: Array = room_data["bounds"]
		if room_data["id"] == "lobby" and lobby_bounds.size() >= 4:
			bounds = lobby_bounds
		room_specs.append({
			"id": room_data["id"],
			"label": room_data["label"],
			"rect": Rect2(bounds[0], bounds[1], bounds[2], bounds[3]),
			"renderOffset": room_data.get("renderOffset", [0, 0]),
			"material": room_data["material"],
			"doorSide": room_data.get("doorSide", ""),
			"entrance": room_data.get("entrance", []),
			"outsideWindow": room_data.get("outsideWindow", []),
			"officeWindow": room_data.get("officeWindow", []),
		})
	for spec in room_specs:
		_add_room_shell(spec, floor_plan)
	_build_business_suite_layout(floor_plan)
	_build_underfloor_structure(base_layout)
	_build_room_lighting(floor_plan)
	_build_lobby_building_services()
	var exterior_world := TowerExteriorWorld.build(floor_plan)
	if exterior_world != null:
		world_root.add_child(exterior_world)


func _load_floor_plan() -> Dictionary:
	var raw := FileAccess.get_file_as_string("res://floor_plan.json")
	var parsed = JSON.parse_string(raw)
	if not parsed is Dictionary or not parsed.has("rooms"):
		push_error("floor_plan.json is missing or invalid")
		return {
			"rooms": [],
			"playableFloors": {},
			"floorBuildStatus": {},
			"lobbyHallwayOpening": 1800,
			"officeDoorCenters": [],
		}
	return parsed


func _add_room_shell(spec: Dictionary, floor_plan: Dictionary) -> void:
	var rect: Rect2 = spec["rect"]
	var room_id: String = spec["id"]
	var rect_size_px := Vector2i(roundi(rect.size.x), roundi(rect.size.y))
	var render_position_px := Vector2i(roundi(rect.position.x), roundi(rect.position.y))
	var render_offset: Array = spec.get("renderOffset", [0, 0])
	if render_offset.size() >= 2:
		render_position_px += Vector2i(int(render_offset[0]), int(render_offset[1]))
	if room_id == "lobby":
		render_position_px -= lobby_render_origin_px
		for room_data in floor_plan["rooms"]:
			if room_data["id"] == "recreation":
				var hallway_bounds: Array = room_data["bounds"]
				var hallway_top_px := int(hallway_bounds[1])
				if hallway_top_px > render_position_px.y:
					rect_size_px.y = mini(rect_size_px.y, hallway_top_px - render_position_px.y)
				break
	if room_id == "recreation":
		for index in floor_plan["baseLayout"]["hallways"].size():
			var hallway_bounds: Array = floor_plan["baseLayout"]["hallways"][index]
			_add_floor_region("%sHallwayFloor%d" % [room_id, index], hallway_bounds, materials[spec["material"]])
	else:
		var center_px := render_position_px + rect_size_px / 2
		var center := Vector3(float(center_px.x) * WORLD_SCALE, FLOOR_HEIGHT, float(center_px.y) * WORLD_SCALE)
		var size := Vector3(float(rect_size_px.x) * WORLD_SCALE, 0.16, float(rect_size_px.y) * WORLD_SCALE)
		_add_solid_box("%sFloor" % room_id, center, size, materials[spec["material"]])

	var left := float(render_position_px.x) * WORLD_SCALE
	var right := float(render_position_px.x + rect_size_px.x) * WORLD_SCALE
	var top := float(render_position_px.y) * WORLD_SCALE
	var bottom := float(render_position_px.y + rect_size_px.y) * WORLD_SCALE
	var wall_half := structural_wall_thickness / 2.0
	if room_id == "recreation":
		var hallways: Array = floor_plan.get("baseLayout", {}).get("hallways", [])
		if hallways.size() < 3:
			return
		var main_hall: Array = hallways[0]
		var west_cross: Array = hallways[1]
		var east_cross: Array = hallways[2]
		var hall_core_left := float(main_hall[0]) * WORLD_SCALE + wall_half
		var hall_core_right := float(int(main_hall[0]) + int(main_hall[2])) * WORLD_SCALE - wall_half
		var hall_left := left - wall_half
		var hall_right := right + wall_half
		var cross_top := float(west_cross[1]) * WORLD_SCALE + wall_half
		var cross_bottom := float(int(west_cross[1]) + int(west_cross[3])) * WORLD_SCALE - wall_half
		_add_horizontal_solid_wall("%sSouthWall" % room_id, hall_core_left, hall_core_right, bottom + wall_half)
		_add_structural_wall(
			"%sWestCrossWall" % room_id,
			Vector3(hall_left, WALL_HEIGHT / 2.0, (cross_top + cross_bottom) / 2.0),
			cross_bottom - cross_top + structural_wall_thickness,
			false,
		)
		_add_structural_wall(
			"%sEastCrossWall" % room_id,
			Vector3(hall_right, WALL_HEIGHT / 2.0, (cross_top + cross_bottom) / 2.0),
			cross_bottom - cross_top + structural_wall_thickness,
			false,
		)
	elif room_id == "lobby":
		var lobby_suite_layout: Dictionary = floor_plan.get("businessSuiteLayout", {})
		var lobby_back_entry: Array = lobby_suite_layout.get("lobbyBackEntrance", [])
		if lobby_back_entry.size() >= 2:
			var lobby_door_z := float(int(lobby_back_entry[1]) - lobby_render_origin_px.y) * WORLD_SCALE
			_add_vertical_opening_wall(
				"%sWallLeft" % room_id,
				left,
				top,
				bottom,
				[{"center": lobby_door_z, "kind": "door"}],
			)
		else:
			_add_structural_wall("%sWallLeft" % room_id, Vector3(left, WALL_HEIGHT / 2.0, (top + bottom) / 2.0), float(rect_size_px.y) * WORLD_SCALE, false)
		_add_vertical_opening_wall(
			"%sWallRight" % room_id,
			right,
			top,
			bottom,
			[{"center": (top + bottom) / 2.0, "kind": "window"}],
		)
		_add_structural_wall("%sWallTop" % room_id, Vector3((left + right) / 2.0, WALL_HEIGHT / 2.0, top), float(rect_size_px.x) * WORLD_SCALE, true)
		_add_horizontal_wall_segments("%sWallBottom" % room_id, left, right, bottom, [float(floor_plan["lobbyHallwayOpening"]) * WORLD_SCALE], 1.8)
	elif room_id == "executive_suite":
		var outside_window: Array = spec["outsideWindow"]
		var office_window: Array = spec["officeWindow"]
		var door: Array = floor_plan["baseLayout"]["executiveSuite"]["door"]
		var outer_left := left - wall_half
		var outer_right := right + wall_half
		var outer_top := top - wall_half
		var outer_bottom := bottom + wall_half
		var outside_openings := _shared_exterior_window_openings(
			floor_plan,
			top,
			bottom,
			[{"center": float(outside_window[1]) * WORLD_SCALE, "kind": "window"}],
		)
		_add_vertical_opening_wall("%sOutsideWall" % room_id, outer_left, top, bottom, outside_openings)
		_add_vertical_opening_wall("%sOfficeWall" % room_id, outer_right, top, bottom, [
			{"center": float(door[1]) * WORLD_SCALE, "kind": "door"},
			{"center": float(office_window[1]) * WORLD_SCALE, "kind": "window"},
		])
		_add_horizontal_solid_wall("%sWallTop" % room_id, outer_left, outer_right, outer_top)
		_add_horizontal_solid_wall("%sWallBottom" % room_id, outer_left, outer_right, outer_bottom)
	elif room_id == "basement_b1":
		_add_structural_wall("%sWallLeft" % room_id, Vector3(left, WALL_HEIGHT / 2.0, (top + bottom) / 2.0), float(rect_size_px.y) * WORLD_SCALE, false)
		var b1_layout: Dictionary = floor_plan.get("businessSuiteLayout", {}).get("b1", {})
		var interior_half: Array = b1_layout.get("interiorBusinessHalf", [])
		var b1_gate: Array = b1_layout.get("exteriorGate", [])
		var yard_access: Array = b1_layout.get("yardAccess", [])
		if interior_half.size() < 4 or b1_gate.size() < 2 or yard_access.size() < 2:
			return
		var divider_x := left + float(int(interior_half[0]) + int(interior_half[2])) * WORLD_SCALE
		var interior_top := top + float(int(interior_half[1])) * WORLD_SCALE
		var interior_bottom := interior_top + float(int(interior_half[3])) * WORLD_SCALE
		_add_horizontal_solid_wall("%sBusinessNorthWall" % room_id, left, divider_x, interior_top)
		_add_horizontal_solid_wall("%sBusinessSouthWall" % room_id, left, divider_x, interior_bottom)
		var access_z := top + float(int(yard_access[1])) * WORLD_SCALE
		var exterior_gate_z := top + float(int(b1_gate[1])) * WORLD_SCALE
		var gate_half_width := 1.5
		_add_yard_fence_vertical("%sBusinessFenceNorth" % room_id, divider_x, top, access_z - gate_half_width)
		_add_yard_fence_vertical("%sBusinessFenceSouth" % room_id, divider_x, access_z + gate_half_width, bottom)
		_add_yard_fence_horizontal("%sYardFenceNorth" % room_id, divider_x, right, top)
		_add_yard_fence_horizontal("%sYardFenceSouth" % room_id, divider_x, right, bottom)
		_add_yard_fence_vertical("%sYardFenceEastNorth" % room_id, right, top, exterior_gate_z - gate_half_width)
		_add_yard_fence_vertical("%sYardFenceEastSouth" % room_id, right, exterior_gate_z + gate_half_width, bottom)
	elif room_id in ["executive", "public", "office_03", "office_04"]:
		var outer_left := left - wall_half
		var outer_right := right + wall_half
		var outer_top := top - wall_half
		var outer_bottom := bottom + wall_half
		var wall_length_z := bottom - top + structural_wall_thickness
		var window_opening := _shared_exterior_window_openings(
			floor_plan,
			top,
			bottom,
			[{"center": (top + bottom) / 2.0, "kind": "window"}],
		)
		if room_id in ["executive", "office_03"]:
			_add_vertical_opening_wall("%sWallLeft" % room_id, outer_left, top, bottom, window_opening)
			_add_structural_wall("%sWallRight" % room_id, Vector3(outer_right, WALL_HEIGHT / 2.0, (top + bottom) / 2.0), wall_length_z, false)
		else:
			_add_structural_wall("%sWallLeft" % room_id, Vector3(outer_left, WALL_HEIGHT / 2.0, (top + bottom) / 2.0), wall_length_z, false)
			_add_vertical_opening_wall("%sWallRight" % room_id, outer_right, top, bottom, window_opening)
		var entrance: Array = spec["entrance"]
		var door_center := float(entrance[0]) * WORLD_SCALE
		if spec["doorSide"] == "north":
			_add_horizontal_wall_segments("%sWallTop" % room_id, outer_left, outer_right, outer_top, [door_center], 1.55)
			_add_horizontal_solid_wall("%sWallBottom" % room_id, outer_left, outer_right, outer_bottom)
		else:
			_add_horizontal_solid_wall("%sWallTop" % room_id, outer_left, outer_right, outer_top)
			_add_horizontal_wall_segments("%sWallBottom" % room_id, outer_left, outer_right, outer_bottom, [door_center], 1.55)
	else:
		var outer_left := left - wall_half
		var outer_right := right + wall_half
		var outer_top := top - wall_half
		var outer_bottom := bottom + wall_half
		if room_id.begins_with("basement_"):
			_add_structural_wall("%sWallLeft" % room_id, Vector3(outer_left, WALL_HEIGHT / 2.0, (top + bottom) / 2.0), bottom - top + structural_wall_thickness, false)
			_add_structural_wall("%sWallRight" % room_id, Vector3(outer_right, WALL_HEIGHT / 2.0, (top + bottom) / 2.0), bottom - top + structural_wall_thickness, false)
		else:
			var window_openings: Array = []
			for index in range(1, 8):
				window_openings.append({
					"center": lerpf(top, bottom, float(index) / 8.0),
					"kind": "window",
				})
			window_openings = _shared_exterior_window_openings(
				floor_plan,
				top,
				bottom,
				window_openings,
			)
			_add_vertical_opening_wall("%sWallLeft" % room_id, outer_left, top, bottom, window_openings)
			_add_vertical_opening_wall("%sWallRight" % room_id, outer_right, top, bottom, window_openings)
		_add_horizontal_solid_wall("%sWallTop" % room_id, outer_left, outer_right, outer_top)
		_add_horizontal_solid_wall("%sWallBottom" % room_id, outer_left, outer_right, outer_bottom)


func _shared_exterior_window_openings(
	floor_plan: Dictionary,
	top: float,
	bottom: float,
	existing: Array,
) -> Array:
	# Tower floors and perimeter business-suite partitions share one render
	# elevation. Align their facade apertures so one shell cannot wall off
	# another floor's view through the same exterior window.
	var centers: Array[float] = []
	for opening_value in existing:
		if opening_value is Dictionary:
			_add_unique_window_center(centers, float(opening_value.get("center", 0.0)))

	var full_facade_bounds: Array = []
	var quadrant_room_ids := ["executive", "public", "office_03", "office_04"]
	for room_value in floor_plan.get("rooms", []):
		if not room_value is Dictionary:
			continue
		var room: Dictionary = room_value
		if str(room.get("id", "")) == "commercial_floor":
			full_facade_bounds = room.get("bounds", [])
		elif str(room.get("id", "")) in quadrant_room_ids:
			var room_bounds: Array = room.get("bounds", [])
			if room_bounds.size() >= 4:
				_add_unique_window_center(
					centers,
					(float(room_bounds[1]) + float(room_bounds[3]) / 2.0) * WORLD_SCALE,
				)

	if full_facade_bounds.size() >= 4:
		var facade_top := float(full_facade_bounds[1]) * WORLD_SCALE
		var facade_bottom := (
			float(full_facade_bounds[1]) + float(full_facade_bounds[3])
		) * WORLD_SCALE
		for index in range(1, 8):
			_add_unique_window_center(
				centers,
				lerpf(facade_top, facade_bottom, float(index) / 8.0),
			)

	var suite: Dictionary = floor_plan.get("baseLayout", {}).get("executiveSuite", {})
	var suite_window: Array = suite.get("outsideWindow", [])
	if suite_window.size() >= 2:
		_add_unique_window_center(centers, float(suite_window[1]) * WORLD_SCALE)

	var openings: Array = []
	for center in centers:
		if center >= top + 0.75 and center <= bottom - 0.75:
			openings.append({"center": center, "kind": "window"})
	return openings


func _add_unique_window_center(centers: Array[float], center: float) -> void:
	for existing_center in centers:
		if absf(existing_center - center) < 1.5:
			return
	centers.append(center)


func _build_business_suite_layout(floor_plan: Dictionary) -> void:
	var layout: Dictionary = floor_plan.get("businessSuiteLayout", {})
	var standard_units: Array = layout.get("standardFloorUnits", [])
	var wall_keys: Dictionary = {}
	for floor_number in [2, 3, 4, 5, 8, 9, 10, 11, 12]:
		var floor_data: Dictionary = floor_plan.get("playableFloors", {}).get(str(floor_number), {})
		var room := str(floor_data.get("room", ""))
		var suite_layout_key := str(floor_data.get("suiteLayout", "standardFloorUnits"))
		var floor_units: Array = layout.get(suite_layout_key, standard_units)
		for raw_business in floor_data.get("businesses", []):
			var business: Dictionary = raw_business
			var unit_number := int(business.get("unitNumber", 0))
			for raw_unit in floor_units:
				var unit: Dictionary = raw_unit
				if int(unit.get("unitNumber", 0)) != unit_number:
					continue
				var bounds: Array = unit.get("bounds", [])
				if bounds.size() < 4:
					break
				_add_business_suite_walls(
					room,
					"Floor%02dUnit%02d" % [floor_number, unit_number],
					bounds,
					str(unit.get("doorSide", "south")),
					wall_keys,
				)
				_add_business_suite_sign(room, business, bounds)
				break

	var base_layout: Dictionary = floor_plan.get("baseLayout", {})
	var office_bounds: Dictionary = {}
	for raw_office in base_layout.get("offices", []):
		var office: Dictionary = raw_office
		office_bounds[str(office.get("id", ""))] = office.get("bounds", [])
	var floor_six: Dictionary = floor_plan.get("playableFloors", {}).get("6", {})
	for raw_business in floor_six.get("businesses", []):
		var business: Dictionary = raw_business
		var room := str(business.get("officeRoom", ""))
		var bounds: Array = office_bounds.get(room, [])
		if bounds.size() < 4:
			continue
		var half_width := int(int(bounds[2]) / 2.0)
		var half_x := int(bounds[0])
		if str(business.get("officeHalf", "west")) == "east":
			half_x += half_width
		var half_bounds: Array = [half_x, bounds[1], half_width, bounds[3]]
		_add_business_suite_sign(room, business, half_bounds)

	for room in ["executive", "public", "office_03", "office_04"]:
		var bounds: Array = office_bounds.get(room, [])
		if bounds.size() < 4:
			continue
		var x := int(bounds[0]) + int(int(bounds[2]) / 2.0)
		var y := int(bounds[1])
		var height := int(bounds[3])
		var gap := 180
		if y == 0:
			_add_business_wall(
				room,
				"Floor06Divider_%s" % room,
				false,
				x,
				y + int((height - gap) / 2.0),
				height - gap,
				wall_keys,
			)
		else:
			_add_business_wall(
				room,
				"Floor06Divider_%s" % room,
				false,
				x,
				y + gap + int((height - gap) / 2.0),
				height - gap,
				wall_keys,
			)

	var basement: Dictionary = layout.get("b1", {})
	var b1_units: Array = basement.get("businessUnits", [])
	var b1_businesses: Array = floor_plan.get("floorProgram", {}).get("pabloCorpBusinessArea", {}).get("b1Businesses", [])
	for raw_business in b1_businesses:
		var business: Dictionary = raw_business
		var unit_number := int(business.get("unitNumber", 0))
		for raw_unit in b1_units:
			var unit: Dictionary = raw_unit
			if int(unit.get("unitNumber", 0)) != unit_number:
				continue
			var bounds: Array = unit.get("bounds", [])
			if bounds.size() < 4:
				break
			_add_business_suite_walls(
				"basement_b1",
				"B1Unit%02d" % unit_number,
				bounds,
				str(unit.get("doorSide", "south")),
				wall_keys,
			)
			_add_business_suite_sign("basement_b1", business, bounds)
			break

func _add_yard_fence_horizontal(node_prefix: String, left: float, right: float, z: float) -> void:
	var length := right - left
	if length <= 0.2:
		return
	var center_x := (left + right) / 2.0
	for rail in [{"name": "Lower", "height": 0.3}, {"name": "Middle", "height": 0.78}, {"name": "Upper", "height": 1.28}]:
		_add_solid_box(
			"%s%sRail" % [node_prefix, rail["name"]],
			Vector3(center_x, rail["height"], z),
			Vector3(length, 0.07, 0.07),
			materials["metal"],
		)
	for index in range(int(length / 6.0) + 2):
		var x := left + minf(float(index) * 6.0, length)
		_add_solid_box(
			"%sPost%d" % [node_prefix, index],
			Vector3(x, 0.68, z),
			Vector3(0.09, 1.36, 0.09),
			materials["metal"],
		)


func _add_yard_fence_vertical(node_prefix: String, x: float, top: float, bottom: float) -> void:
	var length := bottom - top
	if length <= 0.2:
		return
	var center_z := (top + bottom) / 2.0
	for rail in [{"name": "Lower", "height": 0.3}, {"name": "Middle", "height": 0.78}, {"name": "Upper", "height": 1.28}]:
		_add_solid_box(
			"%s%sRail" % [node_prefix, rail["name"]],
			Vector3(x, rail["height"], center_z),
			Vector3(0.07, 0.07, length),
			materials["metal"],
		)
	for index in range(int(length / 6.0) + 2):
		var z := top + minf(float(index) * 6.0, length)
		_add_solid_box(
			"%sPost%d" % [node_prefix, index],
			Vector3(x, 0.68, z),
			Vector3(0.09, 1.36, 0.09),
			materials["metal"],
		)


func _add_business_suite_walls(
	room: String,
	tag: String,
	bounds: Array,
	door_side: String,
	wall_keys: Dictionary,
) -> void:
	var x := int(bounds[0])
	var y := int(bounds[1])
	var width := int(bounds[2])
	var height := int(bounds[3])
	var gap := 600
	var left_width := int((width - gap) / 2.0)
	var left_center := x + int(left_width / 2.0)
	var right_center := x + width - int(left_width / 2.0)
	if door_side == "south":
		_add_business_wall(room, "%sNorth" % tag, true, x + int(width / 2.0), y, width, wall_keys)
		_add_business_wall(room, "%sSouthL" % tag, true, left_center, y + height, left_width, wall_keys)
		_add_business_wall(room, "%sSouthR" % tag, true, right_center, y + height, left_width, wall_keys)
	else:
		_add_business_wall(room, "%sNorthL" % tag, true, left_center, y, left_width, wall_keys)
		_add_business_wall(room, "%sNorthR" % tag, true, right_center, y, left_width, wall_keys)
		_add_business_wall(room, "%sSouth" % tag, true, x + int(width / 2.0), y + height, width, wall_keys)
	_add_business_suite_side_wall(room, "%sWest" % tag, x, y, height, wall_keys)
	_add_business_suite_side_wall(room, "%sEast" % tag, x + width, y, height, wall_keys)


func _add_business_suite_side_wall(
	room: String,
	tag: String,
	x: int,
	top_px: int,
	height_px: int,
	wall_keys: Dictionary,
) -> void:
	var center_px := top_px + int(height_px / 2.0)
	var key := "%s|v|%d|%d|%d" % [room, x, center_px, height_px]
	if not _is_business_suite_facade_x(room, x):
		_add_business_wall(room, tag, false, x, center_px, height_px, wall_keys)
		return
	if wall_keys.has(key):
		return
	wall_keys[key] = true

	var start := _pygame_to_world(x, top_px, room)
	var finish := _pygame_to_world(x, top_px + height_px, room)
	var wall_top := minf(start.z, finish.z)
	var wall_bottom := maxf(start.z, finish.z)
	var openings := _shared_exterior_window_openings(
		floor_plan_data,
		wall_top,
		wall_bottom,
		[],
	)
	_add_vertical_opening_wall(tag, start.x, wall_top, wall_bottom, openings)


func _is_business_suite_facade_x(room: String, x: int) -> bool:
	if room.begins_with("basement_"):
		return false
	for room_value in floor_plan_data.get("rooms", []):
		if not room_value is Dictionary:
			continue
		var room_data: Dictionary = room_value
		if str(room_data.get("id", "")) != room:
			continue
		var bounds: Array = room_data.get("bounds", [])
		if bounds.size() < 4:
			return false
		var render_offset: Array = room_data.get("renderOffset", [0, 0])
		var left := int(bounds[0])
		if render_offset.size() >= 2:
			left += int(render_offset[0])
		var right := left + int(bounds[2])
		return x == left or x == right
	return false


func _add_business_wall(
	room: String,
	tag: String,
	horizontal: bool,
	x: int,
	y: int,
	length: int,
	wall_keys: Dictionary,
) -> void:
	var key := "%s|%s|%d|%d|%d" % [room, "h" if horizontal else "v", x, y, length]
	if wall_keys.has(key):
		return
	wall_keys[key] = true
	var center := _pygame_to_world(x, y, room)
	center.y = WALL_HEIGHT / 2.0
	_add_structural_wall(tag, center, float(length) * WORLD_SCALE, horizontal)


func _add_business_suite_sign(room: String, business: Dictionary, bounds: Array) -> void:
	if bounds.size() < 4:
		return
	var center := _pygame_to_world(
		int(bounds[0]) + int(int(bounds[2]) / 2.0),
		int(bounds[1]) + int(int(bounds[3]) / 2.0),
		room,
	)
	var sign := Label3D.new()
	sign.name = "BusinessSign_%s" % str(business.get("businessKey", "unit"))
	sign.text = str(business.get("label", "BUSINESS OFFICE"))
	sign.font_size = 24
	sign.pixel_size = 0.006
	sign.modulate = Color("#e8dfc8")
	sign.position = center + Vector3(0.0, 2.25, 0.0)
	add_child(sign)


func _add_floor_region(node_name: String, bounds: Array, material: Material) -> void:
	var center := Vector3((float(bounds[0]) + float(bounds[2]) / 2.0) * WORLD_SCALE, FLOOR_HEIGHT, (float(bounds[1]) + float(bounds[3]) / 2.0) * WORLD_SCALE)
	var size := Vector3(float(bounds[2]) * WORLD_SCALE, 0.16, float(bounds[3]) * WORLD_SCALE)
	_add_solid_box(node_name, center, size, material)


func _build_underfloor_structure(base_layout: Dictionary) -> void:
	var bounds: Array = base_layout.get("outerBounds", [])
	if bounds.size() < 4:
		return
	var structure: Dictionary = base_layout.get("structure", {})
	var span_x := float(bounds[2]) * WORLD_SCALE
	var span_z := float(bounds[3]) * WORLD_SCALE
	var left := float(bounds[0]) * WORLD_SCALE
	var top := float(bounds[1]) * WORLD_SCALE
	var right := left + span_x
	var bottom := top + span_z
	var beam_width := maxf(float(structure.get("foundationBeamWidthMeters", 0.5)), 0.1)
	var beam_depth := maxf(float(structure.get("foundationBeamDepthMeters", 0.6)), 0.1)
	var beam_spacing := maxf(float(structure.get("foundationBeamSpacingMeters", 15.0)), 2.0)
	var crawl_clearance := maxf(float(structure.get("crawlSpaceClearHeightMeters", 1.0)), 0.4)
	var beam_top_y := -crawl_clearance
	var beam_center_y := beam_top_y - beam_depth / 2.0
	var center_x := left + span_x / 2.0
	var center_z := top + span_z / 2.0
	var line_index := 0
	var x := left
	while x <= right:
		_add_solid_box(
			"FoundationBeamAcross%d" % line_index,
			Vector3(x, beam_center_y, center_z),
			Vector3(beam_width, beam_depth, span_z),
			materials["foundation"],
		)
		line_index += 1
		x += beam_spacing
	_add_solid_box(
		"FoundationBeamRightEdge",
		Vector3(right, beam_center_y, center_z),
		Vector3(beam_width, beam_depth, span_z),
		materials["foundation"],
	)
	line_index = 0
	var z := top
	while z <= bottom:
		_add_solid_box(
			"FoundationBeamAlong%d" % line_index,
			Vector3(center_x, beam_center_y, z),
			Vector3(span_x, beam_depth, beam_width),
			materials["foundation"],
		)
		line_index += 1
		z += beam_spacing
	_add_solid_box(
		"FoundationBeamBottomEdge",
		Vector3(center_x, beam_center_y, bottom),
		Vector3(span_x, beam_depth, beam_width),
		materials["foundation"],
	)
	var crawl_floor_top := beam_top_y - beam_depth - 0.5
	_add_solid_box(
		"UnderfloorCrawlSlab",
		Vector3(center_x, crawl_floor_top - 0.06, center_z),
		Vector3(span_x, 0.12, span_z),
		materials["foundation"],
	)


func _add_structural_wall(node_name: String, center: Vector3, length: float, horizontal: bool) -> void:
	var thickness := structural_wall_thickness
	var cavity := minf(wall_service_cavity, thickness * 0.6)
	if cavity < 0.01:
		var solid_size := Vector3(length, WALL_HEIGHT, thickness) if horizontal else Vector3(thickness, WALL_HEIGHT, length)
		_add_solid_box(node_name, center, solid_size, materials["wall"])
		return
	var skin := (thickness - cavity) / 2.0
	var skin_offset := (cavity + skin) / 2.0
	if horizontal:
		_add_solid_box(
			node_name + "SkinA",
			center + Vector3(0.0, 0.0, -skin_offset),
			Vector3(length, WALL_HEIGHT, skin),
			materials["wall"],
		)
		_add_solid_box(
			node_name + "SkinB",
			center + Vector3(0.0, 0.0, skin_offset),
			Vector3(length, WALL_HEIGHT, skin),
			materials["wall"],
		)
		_add_box(
			node_name + "CavityCapTop",
			center + Vector3(0.0, WALL_HEIGHT - 0.025, 0.0),
			Vector3(length, 0.05, thickness),
			materials["wall"],
		)
		_add_box(
			node_name + "CavityCapBottom",
			center + Vector3(0.0, 0.025, 0.0),
			Vector3(length, 0.05, thickness),
			materials["wall"],
		)
		_add_box(
			node_name + "ServiceConduit",
			Vector3(center.x, 1.15, center.z),
			Vector3(length * 0.94, 0.045, cavity * 0.65),
			materials["wall_service"],
		)
	else:
		_add_solid_box(
			node_name + "SkinA",
			center + Vector3(-skin_offset, 0.0, 0.0),
			Vector3(skin, WALL_HEIGHT, length),
			materials["wall"],
		)
		_add_solid_box(
			node_name + "SkinB",
			center + Vector3(skin_offset, 0.0, 0.0),
			Vector3(skin, WALL_HEIGHT, length),
			materials["wall"],
		)
		_add_box(
			node_name + "CavityCapTop",
			center + Vector3(0.0, WALL_HEIGHT - 0.025, 0.0),
			Vector3(thickness, 0.05, length),
			materials["wall"],
		)
		_add_box(
			node_name + "CavityCapBottom",
			center + Vector3(0.0, 0.025, 0.0),
			Vector3(thickness, 0.05, length),
			materials["wall"],
		)
		_add_box(
			node_name + "ServiceConduit",
			Vector3(center.x, 1.15, center.z),
			Vector3(cavity * 0.65, 0.045, length * 0.94),
			materials["wall_service"],
		)


func _add_horizontal_solid_wall(node_name: String, left: float, right: float, z: float) -> void:
	_add_structural_wall(node_name, Vector3((left + right) / 2.0, WALL_HEIGHT / 2.0, z), right - left, true)


func _add_vertical_opening_wall(node_name: String, x: float, top: float, bottom: float, openings: Array) -> void:
	var sorted_openings := openings.duplicate()
	sorted_openings.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return float(a["center"]) < float(b["center"]))
	var cursor := top
	for index in sorted_openings.size():
		var opening: Dictionary = sorted_openings[index]
		var width := 1.5 if opening["kind"] == "window" else 1.55
		var opening_top := float(opening["center"]) - width / 2.0
		var opening_bottom := float(opening["center"]) + width / 2.0
		if opening_top > cursor:
			_add_structural_wall(
				"%sSegment%d" % [node_name, index],
				Vector3(x, WALL_HEIGHT / 2.0, (cursor + opening_top) / 2.0),
				opening_top - cursor,
				false,
			)
		if opening["kind"] == "window":
			_add_box("%sGlass%d" % [node_name, index], Vector3(x, 1.55, float(opening["center"])), Vector3(structural_wall_thickness, 0.92, width), materials["window_glass"])
			_add_box("%sWindowTop%d" % [node_name, index], Vector3(x, 2.08, float(opening["center"])), Vector3(structural_wall_thickness + 0.12, 0.12, width + 0.12), materials["wall_trim"])
			_add_box("%sWindowBottom%d" % [node_name, index], Vector3(x, 1.02, float(opening["center"])), Vector3(structural_wall_thickness + 0.12, 0.12, width + 0.12), materials["wall_trim"])
		cursor = opening_bottom
	if cursor < bottom:
		_add_structural_wall(
			"%sEnd" % node_name,
			Vector3(x, WALL_HEIGHT / 2.0, (cursor + bottom) / 2.0),
			bottom - cursor,
			false,
		)


func _add_horizontal_wall_segments(node_prefix: String, left: float, right: float, z: float, door_centers: Array, opening_width: float) -> void:
	var cursor := left
	for door_center in door_centers:
		var center := float(door_center)
		var opening_left := center - opening_width / 2.0
		var opening_right := center + opening_width / 2.0
		if opening_left > cursor:
			_add_structural_wall(
				"%sSegment%d" % [node_prefix, int(cursor * 100.0)],
				Vector3((cursor + opening_left) / 2.0, WALL_HEIGHT / 2.0, z),
				opening_left - cursor,
				true,
			)
		var frame_width := 0.13
		var frame_depth := structural_wall_thickness + 0.08
		var frame_height := 0.18
		_add_box("%sFrameLeft%d" % [node_prefix, int(center * 100.0)], Vector3(opening_left + frame_width / 2.0, WALL_HEIGHT / 2.0, z), Vector3(frame_width, WALL_HEIGHT, frame_depth), materials["wall_trim"])
		_add_box("%sFrameRight%d" % [node_prefix, int(center * 100.0)], Vector3(opening_right - frame_width / 2.0, WALL_HEIGHT / 2.0, z), Vector3(frame_width, WALL_HEIGHT, frame_depth), materials["wall_trim"])
		_add_box("%sFrameHeader%d" % [node_prefix, int(center * 100.0)], Vector3(center, WALL_HEIGHT - frame_height / 2.0, z), Vector3(opening_width, frame_height, frame_depth), materials["wall_trim"])
		cursor = opening_right
	if cursor < right:
		_add_structural_wall(
			"%sEnd" % node_prefix,
			Vector3((cursor + right) / 2.0, WALL_HEIGHT / 2.0, z),
			right - cursor,
			true,
		)


func _build_static_furniture() -> void:
	imported_scenes["table"] = load("res://agentshire-assets/furniture/table_medium.gltf")
	imported_scenes["couch"] = load("res://agentshire-assets/furniture/couch.gltf")
	imported_scenes["lamp"] = load("res://agentshire-assets/furniture/lamp_standing.gltf")
	imported_scenes["character"] = load("res://agentshire-assets/characters/character-male-a.glb")

	_add_lobby_rug()
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


func _build_room_lighting(floor_plan: Dictionary) -> void:
	_add_room_light("HallwayLightNorth", Vector3(110.0, 3.2, 65.0), Color("#ffd29a"), 0.52, 35.0)
	_add_room_light("HallwayLightSouth", Vector3(110.0, 3.2, 185.0), Color("#ffd29a"), 0.52, 35.0)
	_add_wall_sconce("HallwaySconceWest", Vector3(0.15, 2.25, 125.0))
	_add_wall_sconce("HallwaySconceEast", Vector3(219.85, 2.25, 125.0))
	for room_data in floor_plan["rooms"]:
		if str(room_data["id"]).begins_with("basement_b"):
			var basement_bounds: Array = room_data["bounds"]
			var basement_offset: Array = room_data.get("renderOffset", [0, 0])
			var basement_center_x := (float(basement_bounds[0]) + float(basement_bounds[2]) / 2.0) * WORLD_SCALE
			var basement_center_z := (float(basement_bounds[1]) + float(basement_bounds[3]) / 2.0) * WORLD_SCALE
			if basement_offset.size() >= 2:
				basement_center_x += float(basement_offset[0]) * WORLD_SCALE
				basement_center_z += float(basement_offset[1]) * WORLD_SCALE
			_add_room_light(
				"BasementLight%s" % str(room_data["id"]),
				Vector3(basement_center_x, 3.0, basement_center_z),
				Color("#d8c69c"),
				0.38,
				34.0,
			)
			continue
		if room_data["id"] not in ["executive", "public", "office_03", "office_04"]:
			continue
		var bounds: Array = room_data["bounds"]
		var center_x := (float(bounds[0]) + float(bounds[2]) / 2.0) * WORLD_SCALE
		var center_z := (float(bounds[1]) + float(bounds[3]) / 2.0) * WORLD_SCALE
		_add_room_light("OfficeLight%s" % room_data["id"], Vector3(center_x, 3.0, center_z), Color("#f3c88d"), 0.42, 38.0)


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
	controls_label.text = "WASD MOVE · SHIFT HOLD / M3 TOGGLE SPRINT · SPACE/WHEEL DOWN JUMP\nE USE · Z/X ZOOM (NEAR/MID/FAR) · C CLEAN · V REPAIR"
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
	elevator_floor_panel.size = Vector2(400, 270)
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

	elevator_floor_status_label = Label.new()
	elevator_floor_status_label.position = Vector2(28, 128)
	elevator_floor_status_label.size = Vector2(340, 28)
	elevator_floor_status_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	elevator_floor_status_label.add_theme_font_size_override("font_size", 14)
	elevator_floor_status_label.add_theme_color_override("font_color", Color("#9fd3bd"))
	elevator_floor_panel.add_child(elevator_floor_status_label)

	var elevator_instructions := Label.new()
	elevator_instructions.text = "UP / DOWN  ·  OPEN STOPS ONLY\nENTER  ·  RIDE     ESC  ·  CLOSE"
	elevator_instructions.position = Vector2(28, 174)
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

	if transient_notice_remaining > 0.0:
		transient_notice_remaining = maxf(0.0, transient_notice_remaining - delta)
	if elevator_transition_active and elevator_transition_phase == "waiting_destination":
		elevator_wait_remaining -= delta
		if elevator_wait_remaining <= 0.0:
			_abort_elevator_transition("ELEVATOR REQUEST TIMED OUT")
	_smooth_visual_player(delta)
	_update_camera(delta)
	_update_hud()
	_update_art_motion(delta)
	_update_danger_audio(delta)
	_update_temple_music()


func _setup_temple_music() -> void:
	temple_music_player = AudioStreamPlayer.new()
	temple_music_player.name = "TempleMeditationMusic"
	var stream := AudioStreamGenerator.new()
	stream.mix_rate = TEMPLE_MIX_RATE
	stream.buffer_length = 1.0
	temple_music_player.stream = stream
	temple_music_player.volume_db = -15.0
	add_child(temple_music_player)


func _toggle_temple_music() -> void:
	temple_music_enabled = not temple_music_enabled
	if not temple_music_enabled and temple_music_player != null:
		temple_music_player.stop()


func _update_temple_music() -> void:
	if temple_music_player == null:
		return
	var scene_data: Dictionary = snapshot.get("scene", {})
	var in_temple := int(scene_data.get("floor", 1)) == 7 \
		and str(scene_data.get("room", "")) == "floor07_business"
	if not temple_music_enabled or not in_temple:
		if temple_music_player.playing:
			temple_music_player.stop()
		return
	if not temple_music_player.playing:
		temple_music_player.play()
	var playback := temple_music_player.get_stream_playback() as AudioStreamGeneratorPlayback
	if playback == null:
		return
	var frames_available := playback.get_frames_available()
	for _index in range(frames_available):
		playback.push_frame(_temple_music_sample(temple_music_frame))
		temple_music_frame += 1


func _temple_music_sample(frame_index: int) -> Vector2:
	var seconds := float(frame_index) / TEMPLE_MIX_RATE
	var phrase_time := fposmod(seconds, 32.0)
	var note_index := int(phrase_time / 4.0)
	var melody := [261.63, 293.66, 329.63, 392.0, 349.23, 293.66, 261.63, 0.0]
	var frequency := float(melody[note_index])
	var note_time := fposmod(phrase_time, 4.0)
	var envelope := minf(
		clampf(note_time / 0.65, 0.0, 1.0),
		clampf((4.0 - note_time) / 1.1, 0.0, 1.0),
	)
	var melody_sample := 0.0
	if frequency > 0.0:
		melody_sample = (
			sin(TAU * frequency * seconds) * 0.027
			+ sin(TAU * frequency * 2.0 * seconds) * 0.004
		) * envelope
	var drone := sin(TAU * 146.83 * seconds) * 0.010 \
		+ sin(TAU * 220.0 * seconds) * 0.005
	var sample := clampf(melody_sample + drone, -0.045, 0.045)
	return Vector2(sample, sample)


func _update_danger_audio(delta: float) -> void:
	if danger_audio_player == null:
		return
	var scene_data: Dictionary = snapshot.get("scene", {})
	var player_data: Dictionary = scene_data.get("player", {})
	var office: Dictionary = snapshot.get("office", {})
	var enabled := bool(office.get("musicEnabled", false))
	var in_basement := str(scene_data.get("room", "")).begins_with("basement_b")
	var intensity := clampf(float(player_data.get("dangerIntensity", 0.0)), 0.0, 1.0)
	if not enabled:
		if danger_audio_player.playing:
			danger_audio_player.stop()
		danger_audio_player.volume_db = -45.0
		danger_audio_current_track = -1
		danger_audio_silence_seconds = 0.0
		return
	if not in_basement or intensity < 0.02:
		danger_audio_silence_seconds += delta
		danger_audio_player.volume_db = move_toward(danger_audio_player.volume_db, -45.0, delta * 18.0)
		if danger_audio_silence_seconds >= 0.8 and danger_audio_player.playing:
			danger_audio_player.stop()
			danger_audio_current_track = -1
		return
	danger_audio_silence_seconds = 0.0
	if not danger_audio_player.playing:
		var selected_index := danger_audio_rng.randi_range(0, DANGER_AUDIO_TRACK_IDS.size() - 1)
		danger_audio_current_track = DANGER_AUDIO_TRACK_IDS[selected_index]
		var stream := _load_danger_audio_track(danger_audio_current_track)
		if stream == null:
			danger_audio_current_track = -1
			return
		danger_audio_player.stream = stream
		danger_audio_player.play()
	var quiet_gain := 0.06 * intensity
	danger_audio_player.volume_db = move_toward(
		danger_audio_player.volume_db,
		linear_to_db(maxf(quiet_gain, 0.001)),
		delta * 18.0,
	)


func _load_danger_audio_track(track_id: int) -> AudioStreamMP3:
	var filename := "track-%02d.mp3" % track_id
	var paths := [
		"res://callhome/" + filename,
		ProjectSettings.globalize_path("res://../../artifacts/interview-helper/public/callhome/" + filename),
	]
	for path in paths:
		if not FileAccess.file_exists(path):
			continue
		var audio_file := FileAccess.open(path, FileAccess.READ)
		if audio_file == null:
			continue
		var stream := AudioStreamMP3.new()
		stream.data = audio_file.get_buffer(audio_file.get_length())
		return stream
	return null


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
		"result":
			if str(message.get("id", "")) == elevator_command_id and not bool(message.get("ok", false)):
				_abort_elevator_transition(str(message.get("message", "ELEVATOR REQUEST FAILED")))


func _apply_snapshot(message: Dictionary) -> void:
	var scene_data: Dictionary = message.get("scene", {})
	var player: Dictionary = scene_data.get("player", {})
	player_root.set_danger_state(bool(player.get("inDanger", false)))
	var room_id := str(scene_data.get("room", ""))
	var target := _pygame_to_world(float(player.get("x", 0)), float(player.get("y", 0)), room_id)
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
	_sync_prop_surfaces(scene_data.get("objects", []))
	_sync_door_states(scene_data.get("objects", []))
	_sync_automation_characters(scene_data.get("automationCharacters", []))
	_sync_basement_actors(scene_data.get("basement", {}), room_id)


func _pygame_to_world(x: float, y: float, room_id: String = "") -> Vector3:
	var render_position_px := Vector2i(roundi(x), roundi(y))
	var resolved_room_id := room_id
	if resolved_room_id.is_empty():
		resolved_room_id = str(snapshot.get("scene", {}).get("room", ""))
	if resolved_room_id.begins_with("basement_b"):
		for room_data in floor_plan_data.get("rooms", []):
			if str(room_data.get("id", "")) != resolved_room_id:
				continue
			var render_offset: Array = room_data.get("renderOffset", [0, 0])
			if render_offset.size() >= 2:
				render_position_px += Vector2i(int(render_offset[0]), int(render_offset[1]))
			break
	elif maxf(absf(x), absf(y)) >= WORLD_ORIGIN_REBASE_THRESHOLD:
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
		dynamic_root.remove_child(child)
		child.queue_free()
	interaction_rings.clear()
	for item in objects:
		var object: Dictionary = item
		var object_room := str(object.get("room", ""))
		var position := _pygame_to_world(float(object.get("x", 0)), float(object.get("y", 0)), object_room)
		var kind := str(object.get("kind", ""))
		var object_id := str(object.get("id", "bridge-object"))
		var render_position := _pygame_to_world(
			float(object.get("displayX", object.get("x", 0))),
			float(object.get("displayY", object.get("y", 0))),
			object_room,
		)
		var collision_extents: Array = object.get("collisionHalfExtents", [0, 0])
		var marker := _build_bridge_object(
			kind,
			render_position,
			object_id,
			str(object.get("label", "")),
			bool(object.get("constructionComplete", false)),
			bool(object.get("interactive", false)),
			collision_extents,
		)
		marker.name = object_id
		if bool(object.get("nearby", false)):
			_add_interaction_ring(position)


func _sync_basement_actors(basement_value: Variant, room_id: String) -> void:
	var keep: Dictionary = {}
	if not room_id.begins_with("basement_b") or not basement_value is Dictionary:
		for actor_node in basement_actor_nodes.values():
			if is_instance_valid(actor_node):
				actor_node.queue_free()
		basement_actor_nodes.clear()
		return

	var basement: Dictionary = basement_value
	var pests: Variant = basement.get("pests", [])
	if pests is Array:
		for pest_value in pests:
			if not pest_value is Dictionary:
				continue
			var pest: Dictionary = pest_value
			var pest_status := str(pest.get("status", ""))
			if pest_status not in ["active", "carcass"]:
				continue
			var pest_id := str(pest.get("id", ""))
			if pest_id.is_empty():
				continue
			var actor_key := "pest_" + pest_id
			keep[actor_key] = true
			var pest_color := Color("#8f9c83") if pest_status == "active" else Color("#76776d")
			_upsert_basement_actor(
				actor_key,
				str(pest.get("species", "PEST")).to_upper(),
				float(pest.get("x", 0)),
				float(pest.get("y", 0)),
				room_id,
				pest_color,
				false,
				pest_status == "carcass",
			)

	var crew: Variant = basement.get("npcCrew", [])
	if crew is Array:
		for index in crew.size():
			var member_value: Variant = crew[index]
			if not member_value is Dictionary:
				continue
			var member: Dictionary = member_value
			var member_id := str(member.get("id", "crew-%d" % index))
			var actor_key := "crew_" + member_id
			keep[actor_key] = true
			_upsert_basement_actor(
				actor_key,
				str(member.get("label", member.get("name", "TOWER STAFF"))).to_upper(),
				float(member.get("x", 0)),
				float(member.get("y", 0)),
				room_id,
				Color("#769a79"),
				true,
				false,
			)

	for actor_key in basement_actor_nodes.keys():
		if keep.has(actor_key):
			continue
		var stale_node: Node3D = basement_actor_nodes[actor_key]
		if is_instance_valid(stale_node):
			stale_node.queue_free()
		basement_actor_nodes.erase(actor_key)


func _upsert_basement_actor(
	actor_key: String,
	label_text: String,
	x: float,
	y: float,
	room_id: String,
	color: Color,
	is_staff: bool,
	is_carcass: bool,
) -> void:
	var actor_node := basement_actor_nodes.get(actor_key) as Node3D
	if actor_node == null or not is_instance_valid(actor_node):
		actor_node = Node3D.new()
		actor_node.name = actor_key.validate_node_name()
		var body := MeshInstance3D.new()
		body.name = "Body"
		if is_staff:
			var capsule := CapsuleMesh.new()
			capsule.radius = 0.27
			capsule.height = 1.05
			body.mesh = capsule
			body.position.y = 0.62
		else:
			var pest_mesh := SphereMesh.new()
			pest_mesh.radius = 0.28
			pest_mesh.height = 0.44
			body.mesh = pest_mesh
			body.scale = Vector3(1.2, 0.65, 1.65) if not is_carcass else Vector3(1.45, 0.35, 1.8)
			body.position.y = 0.18
		var body_material := StandardMaterial3D.new()
		body_material.albedo_color = color
		body_material.roughness = 0.88
		body.material_override = body_material
		actor_node.add_child(body)
		if is_staff:
			var head := MeshInstance3D.new()
			head.name = "Head"
			var head_mesh := SphereMesh.new()
			head_mesh.radius = 0.18
			head_mesh.height = 0.36
			head.mesh = head_mesh
			head.position.y = 1.28
			head.material_override = body_material
			actor_node.add_child(head)
		var actor_label := Label3D.new()
		actor_label.name = "Label"
		actor_label.text = label_text
		actor_label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		actor_label.font_size = 22
		actor_label.pixel_size = 0.004
		actor_label.position.y = 1.65 if is_staff else 0.72
		actor_label.modulate = Color("#f0e9d7")
		actor_node.add_child(actor_label)
		basement_actor_root.add_child(actor_node)
		basement_actor_nodes[actor_key] = actor_node
	else:
		var actor_label := actor_node.get_node_or_null("Label") as Label3D
		if actor_label != null:
			actor_label.text = label_text
		var body := actor_node.get_node_or_null("Body") as MeshInstance3D
		if body != null:
			var body_material := body.material_override as StandardMaterial3D
			if body_material != null:
				body_material.albedo_color = color
			if not is_staff:
				body.scale = Vector3(1.45, 0.35, 1.8) if is_carcass else Vector3(1.2, 0.65, 1.65)
	actor_node.position = _pygame_to_world(x, y, room_id)


func _build_bridge_object(
kind: String,
position: Vector3,
object_id: String,
label: String = "",
construction_complete: bool = false,
interactive: bool = true,
collision_extents: Array = [],
) -> Node3D:
	if kind in OfficeProp.SUPPORTED_KINDS:
		var prop := OfficeProp.create(kind, object_id == "lobby-reception-desk")
		prop.name = object_id
		prop.position = position
		dynamic_root.add_child(prop)
		return prop
	if kind in ServiceProp.SERVICE_KINDS:
		var prop := ServiceProp.create_service(kind)
		prop.name = object_id
		prop.position = position
		dynamic_root.add_child(prop)
		return prop
	if kind == "receptionist":
		return _build_receptionist(position, object_id)
	if kind == "floor_sign":
		return _build_floor_sign(position, object_id)
	if kind == "crt_terminal":
		return _build_crt_terminal(position, object_id)
	if kind == "business_suite" or kind == "business_kiosk":
		return _build_business_prop(kind, position, object_id, label)
	if kind == "yard_gate":
		return _build_yard_gate(position, object_id, label)
	if kind == "delivery_truck" or kind == "forklift" or kind == "pallet" or kind == "supply_crate":
		return _build_loading_yard_prop(kind, position, object_id, label)
	if kind == "window":
		var window := _add_box_to_dynamic("Window", position + Vector3(0, 1.0, 0), Vector3(1.3, 1.1, 0.08), materials["glass"])
		return window
	elif kind == "door":
		return _build_door_visual(position, object_id)
	elif kind == "elevator" or kind == "service_elevator":
		return _build_elevator_visual(position, object_id)
	elif kind == "stairs" or kind == "basement_stairs":
		return _build_staircase(position, object_id)
	elif kind == "construction_task":
		return _build_construction_marker(position, object_id, label, construction_complete, interactive)
	elif kind == "partition_h" or kind == "partition_h_short" or kind == "partition_v" \
			or kind == "tunnel_wall_h" or kind == "tunnel_wall_v":
		var half_x := float(collision_extents[0]) if collision_extents.size() > 0 else 750.0
		var half_z := float(collision_extents[1]) if collision_extents.size() > 1 else 60.0
		var partition_size := Vector3(maxf(0.2, half_x * 0.02), 2.4, maxf(0.2, half_z * 0.02))
		if kind == "tunnel_wall_h" or kind == "tunnel_wall_v":
			return _add_solid_box_to_dynamic(
				object_id,
				position + Vector3(0.0, 1.1, 0.0),
				partition_size,
				materials["wall_trim"],
			)
		return _add_box_to_dynamic(object_id, position + Vector3(0.0, 1.1, 0.0), partition_size, materials["wall_trim"])
	elif kind == "tv" or kind == "arcade":
		return _add_box_to_dynamic("Terminal", position + Vector3(0, 0.45, 0), Vector3(0.65, 0.9, 0.55), materials["metal"])
	return _add_box_to_dynamic("Object", position + Vector3(0, 0.35, 0), Vector3(0.7, 0.7, 0.7), materials["wall_trim"])


func _build_business_prop(kind: String, position: Vector3, object_id: String, label_text: String) -> Node3D:
	var root := Node3D.new()
	root.name = object_id
	root.position = position
	dynamic_root.add_child(root)
	var body := MeshInstance3D.new()
	body.name = "Body"
	var body_mesh := BoxMesh.new()
	body_mesh.size = Vector3(1.9, 0.9, 0.72) if kind == "business_suite" else Vector3(0.72, 1.45, 0.62)
	body.mesh = body_mesh
	var body_material := StandardMaterial3D.new()
	body_material.albedo_color = Color("#765b3c") if kind == "business_suite" else Color("#557b68")
	body_material.roughness = 0.82
	body.material_override = body_material
	body.position.y = body_mesh.size.y / 2.0
	root.add_child(body)
	var trim := MeshInstance3D.new()
	trim.name = "ServiceSurface"
	var trim_mesh := BoxMesh.new()
	trim_mesh.size = Vector3(body_mesh.size.x * 0.88, 0.08, body_mesh.size.z * 1.08)
	trim_mesh.material = materials["wall_trim"]
	trim.mesh = trim_mesh
	trim.position.y = body_mesh.size.y + 0.035
	root.add_child(trim)
	if kind == "business_kiosk":
		var screen := MeshInstance3D.new()
		screen.name = "KioskScreen"
		var screen_mesh := BoxMesh.new()
		screen_mesh.size = Vector3(0.48, 0.55, 0.035)
		screen_mesh.material = materials["glass"]
		screen.mesh = screen_mesh
		screen.position = Vector3(0.0, 1.0, 0.33)
		root.add_child(screen)
	var nameplate := Label3D.new()
	nameplate.name = "BusinessLabel"
	nameplate.text = label_text
	nameplate.font_size = 20
	nameplate.pixel_size = 0.006
	nameplate.modulate = Color("#f0e7d0")
	nameplate.position = Vector3(0.0, body_mesh.size.y + 0.45, 0.0)
	root.add_child(nameplate)
	return root


func _build_yard_gate(position: Vector3, object_id: String, label_text: String) -> Node3D:
	var root := Node3D.new()
	root.name = object_id
	root.position = position
	dynamic_root.add_child(root)
	var metal := StandardMaterial3D.new()
	metal.albedo_color = Color("#687d6e")
	metal.metallic = 0.45
	metal.roughness = 0.55
	for side in [-1.0, 1.0]:
		var post := MeshInstance3D.new()
		post.name = "GatePost"
		var post_mesh := BoxMesh.new()
		post_mesh.size = Vector3(0.12, 2.25, 0.16)
		post_mesh.material = materials["wall_trim"]
		post.mesh = post_mesh
		post.position = Vector3(side * 1.35, 1.12, 0.0)
		root.add_child(post)
	var gate := MeshInstance3D.new()
	gate.name = "Gate"
	var gate_mesh := BoxMesh.new()
	gate_mesh.size = Vector3(2.55, 1.35, 0.09)
	gate_mesh.material = metal
	gate.mesh = gate_mesh
	gate.position.y = 0.9
	root.add_child(gate)
	var gate_label := Label3D.new()
	gate_label.name = "GateLabel"
	gate_label.text = label_text
	gate_label.font_size = 18
	gate_label.pixel_size = 0.006
	gate_label.modulate = Color("#e7dfc8")
	gate_label.position.y = 2.2
	root.add_child(gate_label)
	return root


func _build_loading_yard_prop(kind: String, position: Vector3, object_id: String, label_text: String) -> Node3D:
	var root := Node3D.new()
	root.name = object_id
	root.position = position
	dynamic_root.add_child(root)
	var body := MeshInstance3D.new()
	body.name = "Body"
	var mesh := BoxMesh.new()
	if kind == "delivery_truck":
		mesh.size = Vector3(3.2, 1.9, 5.4)
	elif kind == "forklift":
		mesh.size = Vector3(1.1, 1.5, 1.8)
	elif kind == "pallet":
		mesh.size = Vector3(1.2, 0.18, 0.9)
	else:
		mesh.size = Vector3(0.9, 0.9, 0.75)
	body.mesh = mesh
	var material := StandardMaterial3D.new()
	material.albedo_color = Color("#5c846d") if kind == "delivery_truck" else (
		Color("#d6a54d") if kind == "forklift" else Color("#ad8150")
	)
	material.roughness = 0.85
	body.material_override = material
	body.position.y = mesh.size.y / 2.0
	root.add_child(body)
	if kind == "delivery_truck":
		var cargo := MeshInstance3D.new()
		cargo.name = "CargoBox"
		var cargo_mesh := BoxMesh.new()
		cargo_mesh.size = Vector3(2.85, 1.05, 3.5)
		cargo_mesh.material = materials["wall_trim"]
		cargo.mesh = cargo_mesh
		cargo.position = Vector3(0.0, 2.0, -0.65)
		root.add_child(cargo)
	var prop_label := Label3D.new()
	prop_label.text = label_text
	prop_label.font_size = 18
	prop_label.pixel_size = 0.006
	prop_label.modulate = Color("#e7dfc8")
	prop_label.position.y = mesh.size.y + 0.25
	root.add_child(prop_label)
	return root


func _build_construction_marker(
position: Vector3,
object_id: String,
label_text: String,
completed: bool,
interactive: bool,
) -> Node3D:
	var root := Node3D.new()
	root.name = object_id
	root.position = position
	dynamic_root.add_child(root)
	var marker_material := StandardMaterial3D.new()
	marker_material.albedo_color = Color("#49ad79") if completed else (
		Color("#dfa64c") if interactive else Color("#6485a0")
	)
	marker_material.emission_enabled = true
	marker_material.emission = marker_material.albedo_color * 0.35
	var marker_mesh := MeshInstance3D.new()
	var marker_box := BoxMesh.new()
	marker_box.size = Vector3(0.55, 0.85, 0.55)
	marker_box.material = marker_material
	marker_mesh.mesh = marker_box
	marker_mesh.position = Vector3(0.0, 0.43, 0.0)
	root.add_child(marker_mesh)
	var sign := Label3D.new()
	sign.text = label_text
	sign.font_size = 28
	sign.pixel_size = 0.006
	sign.position = Vector3(0.0, 1.45, 0.0)
	sign.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	sign.modulate = marker_material.albedo_color
	root.add_child(sign)
	return root


func _sync_prop_surfaces(objects: Array) -> void:
	for value in objects:
		if not value is Dictionary:
			continue
		var object: Dictionary = value
		var prop := dynamic_root.get_node_or_null(NodePath(str(object.get("id", ""))))
		if prop is OfficeProp and typeof(object.get("condition")) == TYPE_INT \
			and typeof(object.get("cleanliness")) == TYPE_INT:
			prop.set_surface_state(int(object["condition"]), int(object["cleanliness"]))


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
	var open_floors := _available_elevator_floors()
	var current_floor := int(scene_data.get("floor", 1))
	selected_elevator_floor = current_floor if open_floors.has(current_floor) \
		else (open_floors[0] if not open_floors.is_empty() else 1)
	_refresh_elevator_floor_label()
	elevator_floor_panel.visible = true
	player_root.set_physics_process(false)


func _available_elevator_floors() -> Array[int]:
	var playable: Variant = floor_plan_data.get("playableFloors", {})
	if not playable is Dictionary:
		return []
	var floors: Array[int] = []
	for floor_key in playable.keys():
		var floor_number := int(str(floor_key))
		if _tower_floor_status(floor_number) in ["open", "construction_open"]:
			floors.append(floor_number)
	floors.sort()
	return floors


func _tower_floor_status(floor_number: int) -> String:
	var statuses: Dictionary = floor_plan_data.get("floorBuildStatus", {})
	if floor_number < 1:
		return str(statuses.get("basement", "under_construction"))
	var exact_status: Variant = statuses.get(str(floor_number))
	if exact_status != null:
		return str(exact_status)
	for floor_range in statuses.keys():
		var endpoints := str(floor_range).split("-", false)
		if endpoints.size() != 2:
			continue
		var first_floor := int(endpoints[0])
		var last_floor := int(endpoints[1])
		if first_floor <= floor_number and floor_number <= last_floor:
			return str(statuses[floor_range])
	return "under_construction"


func _refresh_elevator_floor_label() -> void:
	if elevator_floor_label != null:
		elevator_floor_label.text = "FLOOR %02d" % selected_elevator_floor
	if elevator_floor_status_label != null:
		var playable: Dictionary = floor_plan_data.get("playableFloors", {})
		var stop: Dictionary = playable.get(str(selected_elevator_floor), {})
		elevator_floor_status_label.text = str(stop.get("label", "UNDER CONSTRUCTION"))


func _advance_elevator_floor(direction: int) -> void:
	var open_floors := _available_elevator_floors()
	var current_index := open_floors.find(selected_elevator_floor)
	if current_index < 0:
		current_index = 0
	var next_index := current_index + direction
	if next_index < 0:
		_show_transient_notice("BASEMENT AND FLOORS 02–05 ARE UNDER CONSTRUCTION")
		return
	if next_index >= open_floors.size():
		_show_transient_notice("FLOORS 07–67 ARE UNDER CONSTRUCTION")
		return
	selected_elevator_floor = open_floors[next_index]
	_refresh_elevator_floor_label()


func _handle_elevator_picker_key(keycode: int) -> bool:
	if elevator_floor_panel == null or not elevator_floor_panel.visible:
		return false
	match keycode:
		KEY_UP, KEY_KP_ADD:
			_advance_elevator_floor(1)
		KEY_DOWN, KEY_KP_SUBTRACT:
			_advance_elevator_floor(-1)
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
	if not _available_elevator_floors().has(elevator_destination_floor):
		_show_transient_notice("THAT FLOOR IS UNDER CONSTRUCTION")
		return
	var playable: Dictionary = floor_plan_data.get("playableFloors", {})
	var destination: Dictionary = playable.get(str(elevator_destination_floor), {})
	elevator_destination_room = str(destination.get("room", ""))
	if elevator_destination_room.is_empty():
		_show_transient_notice("ELEVATOR DESTINATION IS UNAVAILABLE")
		return
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
	elevator_transition_root.name = "ElevatorCabin"
	dynamic_root.add_child(elevator_transition_root)
	elevator_transition_root.global_position = origin + Vector3(0.0, -0.04, 0.0)
	elevator_transition_doors.clear()
	elevator_transition_fog_panels.clear()

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

	elevator_transition_fog_material = StandardMaterial3D.new()
	elevator_transition_fog_material.albedo_color = Color(0.72, 0.82, 0.74, 0.84)
	elevator_transition_fog_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	elevator_transition_fog_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	elevator_transition_fog_material.cull_mode = BaseMaterial3D.CULL_DISABLED
	elevator_transition_fog_material.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_DISABLED
	var fog_panels := [
		["ElevatorRearFog", Vector3(0.0, 1.38, -1.055), Vector3(2.16, 2.46, 0.025)],
		["ElevatorLeftFog", Vector3(-1.055, 1.38, 0.0), Vector3(0.025, 2.46, 2.16)],
		["ElevatorRightFog", Vector3(1.055, 1.38, 0.0), Vector3(0.025, 2.46, 2.16)],
	]
	for fog_panel in fog_panels:
		elevator_transition_fog_panels.append(
			_add_transition_box(fog_panel[0], fog_panel[1], fog_panel[2], elevator_transition_fog_material)
		)

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
	elevator_wait_remaining = 7.0
	elevator_command_id = _send_command("select_floor", {"floor": floor_number})


static func elevator_travel_offset(origin_floor: int, destination_floor: int) -> Vector3:
	var floor_delta := destination_floor - origin_floor
	if floor_delta == 0:
		return Vector3.ZERO
	var travel_height := clampf(2.4 + absf(float(floor_delta)) * 0.12, 2.4, 5.0)
	var direction := 1.0 if floor_delta > 0 else -1.0
	return Vector3(0.0, travel_height * direction, 0.0)


func _start_elevator_arrival(target: Vector3, message: Dictionary) -> void:
	elevator_transition_phase = "riding"
	elevator_wait_remaining = 0.0
	elevator_command_id = ""
	var lift := elevator_travel_offset(elevator_origin_floor, elevator_destination_floor)
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
	if elevator_transition_fog_material != null:
		tween.tween_property(elevator_transition_fog_material, "albedo_color:a", 0.14, 0.4)
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
	elevator_transition_fog_panels.clear()
	elevator_transition_fog_material = null
	elevator_transition_active = false
	elevator_transition_phase = ""
	elevator_wait_remaining = 0.0
	elevator_command_id = ""
	player_root.set_physics_process(true)
	last_room_id = ""
	_apply_snapshot(message)


func _abort_elevator_transition(message: String) -> void:
	if not elevator_transition_active:
		return
	elevator_wait_remaining = 0.0
	elevator_command_id = ""
	elevator_transition_phase = "canceling"
	_show_transient_notice(message.to_upper())
	if not is_instance_valid(elevator_transition_root):
		_finish_elevator_abort()
		return
	var tween := create_tween()
	tween.set_parallel(true)
	tween.tween_property(self, "camera_distance", elevator_return_camera_distance, 0.45)
	if elevator_transition_fog_material != null:
		tween.tween_property(elevator_transition_fog_material, "albedo_color:a", 0.14, 0.38)
	if elevator_transition_doors.size() == 2:
		tween.tween_property(elevator_transition_doors[0], "position:x", -0.72, 0.38)
		tween.tween_property(elevator_transition_doors[1], "position:x", 0.72, 0.38)
	tween.set_parallel(false)
	tween.tween_interval(0.1)
	tween.tween_callback(_finish_elevator_abort)


func _finish_elevator_abort() -> void:
	if is_instance_valid(elevator_transition_root):
		elevator_transition_root.queue_free()
	elevator_transition_root = null
	elevator_transition_doors.clear()
	elevator_transition_fog_panels.clear()
	elevator_transition_fog_material = null
	elevator_transition_active = false
	elevator_transition_phase = ""
	elevator_wait_remaining = 0.0
	player_root.set_physics_process(true)
	last_room_id = ""


func _show_transient_notice(message: String, duration_seconds := 5.0) -> void:
	transient_notice_text = message
	transient_notice_remaining = duration_seconds


static func camera_distance_for_level(level: int) -> float:
	return float(CAMERA_DISTANCE_LEVELS[clampi(level, 0, CAMERA_DISTANCE_LEVELS.size() - 1)])


static func next_camera_zoom_level(current_level: int, direction: int) -> int:
	if direction == 0:
		return clampi(current_level, 0, CAMERA_DISTANCE_LEVELS.size() - 1)
	return clampi(
		current_level + (1 if direction > 0 else -1),
		0,
		CAMERA_DISTANCE_LEVELS.size() - 1,
	)


func _step_camera_zoom(direction: int) -> void:
	var next_level := next_camera_zoom_level(camera_zoom_index, direction)
	if next_level == camera_zoom_index:
		return
	camera_zoom_index = next_level
	camera_distance = camera_distance_for_level(camera_zoom_index)
	if is_instance_valid(camera_sfx):
		camera_sfx.play_zoom(direction < 0)


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
	var locked_gate := StaticBody3D.new()
	locked_gate.name = object_id + "-locked-landing"
	locked_gate.position = position + Vector3(0.0, 0.0, 0.36)
	dynamic_root.add_child(locked_gate)
	var gate_shape := BoxShape3D.new()
	gate_shape.size = Vector3(2.2, 2.25, 0.28)
	var gate_collision := CollisionShape3D.new()
	gate_collision.position = Vector3(0.0, 1.125, 0.0)
	gate_collision.shape = gate_shape
	locked_gate.add_child(gate_collision)
	var gate_mesh := BoxMesh.new()
	gate_mesh.size = gate_shape.size
	gate_mesh.material = materials["door"]
	var gate_visual := MeshInstance3D.new()
	gate_visual.name = object_id + "-locked-gate-visual"
	gate_visual.mesh = gate_mesh
	gate_visual.position = Vector3(0.0, 1.125, 0.0)
	locked_gate.add_child(gate_visual)
	var landing_notice := Label3D.new()
	landing_notice.name = object_id + "-construction-sign"
	landing_notice.text = "UNDER CONSTRUCTION\nBASEMENT + FLOORS 02–05" \
		if object_id.begins_with("lobby") \
else "UNDER CONSTRUCTION\nFLOORS 08–67"
	landing_notice.font_size = 28
	landing_notice.pixel_size = 0.006
	landing_notice.position = position + Vector3(0.0, 2.45, 0.58)
	landing_notice.modulate = Color("#fff0ae")
	landing_notice.outline_size = 8
	landing_notice.outline_modulate = Color("#14211e")
	dynamic_root.add_child(landing_notice)
	return first_step


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


func _build_door_visual(position: Vector3, object_id: String) -> Node3D:
	var door_root := Node3D.new()
	door_root.name = object_id
	door_root.position = position
	door_root.set_meta("door_open", false)
	dynamic_root.add_child(door_root)

	var pivot := Node3D.new()
	pivot.name = "DoorPivot"
	pivot.position = Vector3(-0.64, 0.0, 0.84)
	door_root.add_child(pivot)

	var leaf := _door_panel(
		"DoorLeaf",
		Vector3(0.64, 1.0, 0.0),
		Vector3(1.28, 1.95, 0.12),
		materials["door"],
	)
	pivot.add_child(leaf)
	var window := _door_panel(
		"DoorWindow",
		Vector3(0.64, 1.52, 0.068),
		Vector3(0.58, 0.38, 0.018),
		materials["door_glass"],
	)
	pivot.add_child(window)
	var handle := _door_panel(
		"DoorHandle",
		Vector3(1.07, 0.92, 0.085),
		Vector3(0.06, 0.13, 0.035),
		materials["metal"],
	)
	pivot.add_child(handle)
	return door_root


func _door_panel(panel_name: String, position: Vector3, size: Vector3, material: Material) -> MeshInstance3D:
	var mesh := BoxMesh.new()
	mesh.size = size
	mesh.material = material
	var panel := MeshInstance3D.new()
	panel.name = panel_name
	panel.position = position
	panel.mesh = mesh
	panel.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return panel


static func door_swing_angle(is_open: bool) -> float:
	return -1.45 if is_open else 0.0


static func lobby_render_origin_from_plan(
	lobby_bounds: Array,
	main_hall: Array,
	opening_offset: int,
) -> Vector2i:
	if lobby_bounds.size() < 4 or main_hall.size() < 4:
		return Vector2i.ZERO
	var opening_center_x := int(lobby_bounds[0]) + opening_offset
	var hallway_center_x := int(main_hall[0]) + int(main_hall[2]) / 2
	return Vector2i(
		opening_center_x - hallway_center_x,
		int(lobby_bounds[1]) + int(lobby_bounds[3]),
	)


func _sync_door_states(objects: Array) -> void:
	for value in objects:
		if not value is Dictionary:
			continue
		var object: Dictionary = value
		if str(object.get("kind", "")) != "door":
			continue
		var door_root := dynamic_root.get_node_or_null(NodePath(str(object.get("id", ""))))
		if door_root == null:
			continue
		var pivot := door_root.get_node_or_null("DoorPivot") as Node3D
		if pivot == null:
			continue
		var destination_room: Variant = object.get("destinationRoom")
		var is_open := bool(object.get("doorOpen", false))
		if destination_room is String and not str(destination_room).is_empty():
			is_open = is_open or bool(object.get("nearby", false))
		if bool(door_root.get_meta("door_open", false)) == is_open:
			continue
		door_root.set_meta("door_open", is_open)
		var tween := create_tween()
		tween.tween_property(pivot, "rotation:y", door_swing_angle(is_open), 0.18)


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


func _add_solid_box_to_dynamic(
	node_name: String,
	position: Vector3,
	size: Vector3,
	material: Material,
) -> StaticBody3D:
	var body := StaticBody3D.new()
	body.name = node_name
	body.position = position
	body.collision_layer = 1
	body.collision_mask = 0
	var shape := BoxShape3D.new()
	shape.size = size
	var collision := CollisionShape3D.new()
	collision.shape = shape
	body.add_child(collision)
	var mesh := BoxMesh.new()
	mesh.size = size
	mesh.material = material
	var instance := MeshInstance3D.new()
	instance.name = node_name + "-mesh"
	instance.mesh = mesh
	instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	body.add_child(instance)
	dynamic_root.add_child(body)
	return body


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
	var floor_number := int(scene_data.get("floor", 1))
	var playable: Dictionary = floor_plan_data.get("playableFloors", {})
	var floor_stop: Dictionary = playable.get(str(floor_number), {})
	var room_name := room_id.replace("_", " ").to_upper()
	if room_id == str(floor_stop.get("room", "")):
		room_name = str(floor_stop.get("label", room_name))
	if room_id.begins_with("basement_b"):
		room_name = "BASEMENT B%s" % room_id.trim_prefix("basement_b")
		room_label.text = room_name
	else:
		room_label.text = "FLOOR %02d  ·  %s" % [floor_number, room_name]
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
			controls_label.text = "WASD MOVE · SHIFT HOLD / M3 TOGGLE SPRINT · SPACE/WHEEL DOWN JUMP\n%s  ·  %s  ·  %s" % [
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
		if floor_number == 7 and room_id == "floor07_business":
			var music_state := "ON" if temple_music_enabled else "OFF"
			controls_label.text = "WASD MOVE · SHIFT HOLD / M3 TOGGLE SPRINT · SPACE/WHEEL DOWN JUMP\nE USE · M MEDITATION MUSIC %s · C CLEAN · V REPAIR" % music_state
		else:
			controls_label.text = "WASD MOVE · SHIFT HOLD / M3 TOGGLE SPRINT · SPACE/WHEEL DOWN JUMP\nE USE · Z/X ZOOM (NEAR/MID/FAR) · C CLEAN · V REPAIR"
		controls_label.add_theme_color_override("font_color", Color("#c4ddcb"))
	var navigation: Dictionary = scene_data.get("navigation", {})
	mission_label.text = "MISSION  ·  " + str(navigation.get("mission", "Waiting for the game simulation to provide the room mission."))
	if room_id.begins_with("basement_b"):
		var basement: Dictionary = scene_data.get("basement", {})
		var building: Dictionary = basement.get("building", {})
		var pests: Variant = basement.get("pests", [])
		var active_pests := 0
		var carcasses := 0
		if pests is Array:
			for pest_value in pests:
				if not pest_value is Dictionary:
					continue
				var pest_status := str(pest_value.get("status", ""))
				active_pests += 1 if pest_status == "active" else 0
				carcasses += 1 if pest_status == "carcass" else 0
		var stamina := clampi(int(office.get("pestStamina", 0)), 0, 100)
		var uniform_label := "UNIFORM ON" if bool(office.get("pestUniformWorn", false)) else "UNIFORM OFF"
		controls_label.text = "WASD MOVE · F MELEE · E PICK UP / USE · O MUSIC %s\nSTAMINA %d%% · %s · %d ACTIVE PESTS · %d CARCASSES" % [
			"ON" if bool(office.get("musicEnabled", false)) else "OFF",
			stamina,
			uniform_label,
			active_pests,
			carcasses,
		]
		controls_label.add_theme_color_override("font_color", Color("#d9ddc7"))
		mission_label.text = "TOWER SYSTEMS  ·  POWER %d%%  ·  WATER %d%%  ·  UPKEEP %d%%" % [
			int(building.get("powerCondition", 0)),
			int(building.get("plumbingCondition", 0)),
			int(building.get("upkeepCondition", 0)),
		]
	var notice := transient_notice_text if transient_notice_remaining > 0.0 \
		else str(office.get("notice", "WAITING FOR GAME SIMULATION"))
	notice_label.text = "ƒ%.2f  ·  %s" % [float(office.get("funds", 0.0)), notice]
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
		last_native_app_page = ""
		return
	if page == "merchant" and last_native_app_page != "merchant":
		ghost_dialogue_line = "You didn't see me. People rarely notice what they expect to find."
	last_native_app_page = page
	native_app_panel.color = Color("#07151af5")
	native_app_title.add_theme_color_override("font_color", Color("#eff8df"))
	native_app_body.add_theme_color_override("font_color", Color("#c4ddcb"))
	native_app_body.add_theme_font_size_override("font_size", 16)
	native_app_footer.add_theme_color_override("font_color", Color("#f8b957"))

	var page_source_value: Variant = office.get("pageSource")
	var page_source := "" if page_source_value == null else str(page_source_value)
	var workers: Array = office.get("workers", [])
	var location := "FLOOR %02d  /  %s" % [
		int(scene_data.get("floor", 1)),
		str(scene_data.get("room", "UNKNOWN")).replace("_", " ").to_upper(),
	]
	match page:
		"vending":
			native_app_title.text = "TOWER VENDING / SERVER-PRICED STOCK"
			var vending_lines: Array[String] = []
			var vending_value: Variant = office.get("vendingCatalog", [])
			if vending_value is Array:
				for index in mini(vending_value.size(), 5):
					var item_value: Variant = vending_value[index]
					if not item_value is Dictionary:
						continue
					var vending_item: Dictionary = item_value
					vending_lines.append("%d  %s  /  FIAT %s" % [
						index + 1,
						"%s · %s" % [
							str(vending_item.get("name", vending_item.get("id", "ITEM"))),
							str(vending_item.get("blurb", "")),
						],
						str(int(vending_item.get("priceFiat", 0))),
					])
			if vending_lines.is_empty():
				vending_lines.append("VENDING STOCK LOADING OR ACCOUNT LINK REQUIRED")
			native_app_body.text = "BUYABLE VENDING STOCK\n%s\n\nPRESS B FOR BUSINESS STOCK + GHOST CONTACT\n%s" % [
				"\n".join(vending_lines),
				"The Ghost has no published items or prices. Ask in person.",
			]
			native_app_footer.text = "1–5 BUY SERVER-PRICED STOCK  ·  B BUSINESS STOCK  ·  ESC CLOSE"
		"business_stock":
			native_app_title.text = "TOWER VENDING / BUSINESS STOCK"
			var business_stock_lines: Array[String] = []
			var listings_value: Variant = office.get("businessStockLines", [])
			if listings_value is Array:
				for listing_value in listings_value:
					if not listing_value is Dictionary:
						continue
					var listing: Dictionary = listing_value
					var seller := ""
					if listing.get("sellerName") is String:
						seller = str(listing.get("sellerName"))
					if seller.is_empty():
						seller = str(listing.get("specialty", "SPECIALTY")).replace("-", " ").to_upper()
					var seller_location := "LOCATION NOT ASSIGNED"
					var seller_location_value: Variant = listing.get("sellerLocationLabel")
					if seller_location_value is String and not seller_location_value.is_empty():
						seller_location = str(seller_location_value)
					var detail := ""
					var products_value: Variant = listing.get("items", [])
					if products_value is Array and not products_value.is_empty():
						var product_lines: Array[String] = []
						for product_value in products_value:
							if product_value is Dictionary:
								product_lines.append("%s ƒ%s" % [
									"%s · %s" % [
										str(product_value.get("name", product_value.get("id", "ITEM"))),
										str(product_value.get("blurb", "")),
									],
									str(int(product_value.get("priceFiat", 0))),
								])
						detail = ", ".join(product_lines)
					else:
						var categories: Variant = listing.get("quoteCategories", [])
						var category_names: Array[String] = []
						if categories is Array:
							for category_value in categories:
								if category_value is String:
									category_names.append(category_value)
						detail = ", ".join(category_names) if not category_names.is_empty() else "QUOTE REQUIRED"
					business_stock_lines.append("%s · %s / %s" % [seller, seller_location, detail])
			if business_stock_lines.is_empty():
				business_stock_lines.append("BUSINESS STOCK LOADING OR ACCOUNT LINK REQUIRED")
			var ghost_value: Variant = office.get("ghostListing", {})
			var ghost_notice := "THE GHOST / DIRECT INTERACTION ONLY"
			if ghost_value is Dictionary:
				ghost_notice = str(ghost_value.get("notice", ghost_notice))
			native_app_body.text = "SELLER LOCATIONS ARE SHOWN ONLY WHEN KNOWN\n%s\n\n%s\nDIRECT, PROXIMITY-VERIFIED INTERACTION ONLY FOR THE GHOST." % [
				"\n".join(business_stock_lines),
				ghost_notice
			]
			native_app_footer.text = "B RETURN TO VENDING STOCK  ·  ESC CLOSE"
		"merchant":
			native_app_panel.color = Color("#f0eee8")
			native_app_title.add_theme_color_override("font_color", Color("#171717"))
			native_app_body.add_theme_color_override("font_color", Color("#30302d"))
			native_app_footer.add_theme_color_override("font_color", Color("#76543d"))
			native_app_title.text = "THE GHOST  /  PRIVATE CONVERSATION"
			native_app_body.text = "%s\n\n%s\n\n1  You worked for Pablo?\n2  How do you stay unnoticed?\n3  I should go." % [
				location,
				ghost_dialogue_line,
			]
			native_app_footer.text = "1–2 ASK  ·  3 OR ESC LEAVE"
		"phone":
			native_app_title.text = "TOWER PAY PHONE"
			native_app_body.text = "CALLL HOME\nCOMMS\n\nThis line is limited to those two services. The game screen is read-only in this pass."
			native_app_footer.text = "CALLS AND MESSAGES ARE NOT STARTED HERE  ·  ESC CLOSE"
		"reception":
			native_app_panel.color = Color("#f0eee8")
			native_app_title.add_theme_color_override("font_color", Color("#171717"))
			native_app_body.add_theme_color_override("font_color", Color("#30302d"))
			native_app_footer.add_theme_color_override("font_color", Color("#76543d"))
			native_app_title.text = "MILA  /  RECEPTION SERVICES"
			native_app_body.text = "%s\n\nCLASSIFIEDS & BUSINESS SERVICES\n1  JOB OPPORTUNITIES\n2  BUSINESS CONTRACTS\n3  REAL ESTATE / LEASING\n\nSelected services open their existing SALARYMAN screens." % location
			native_app_footer.text = "1–3 OPEN A SERVICE  ·  ESC CLOSE"
		"systems":
			native_app_title.text = "SALARYMAN OS  /  SYSTEMS TERMINAL"
			native_app_body.text = "CONNECTED GAME MODULES\n%s  /  TEAM %d  /  FIAT ƒ%.2f\n1 JOB COMMAND  2 ACCOUNTING  3 CONTACTS\n4 MARKETING  5 DARKROOM  6 INTELLIGENCE\n7 BANK VIEW  8 CALLL HOME / COMMS  9 CLOSE" % [
				location,
				workers.size(),
				float(office.get("funds", 0.0)),
			]
			native_app_footer.text = "1–8 OPEN MODULES  ·  9 OR ESC CLOSE"
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
		"pest_jobs":
			native_app_title.text = "BASEMENT PEST WORK"
			var jobs: Variant = office.get("pestJobs", [])
			var orders: Dictionary = office.get("pestWorkOrders", {})
			var job_lines: Array[String] = []
			if jobs is Array:
				for index in jobs.size():
					var job_value: Variant = jobs[index]
					if not job_value is Dictionary:
						continue
					var job: Dictionary = job_value
					var progress: Dictionary = orders.get(str(job.get("id", "")), {})
					job_lines.append("%d  %s  ·  %d/%d" % [
						index + 1,
						str(job.get("label", "WORK ORDER")),
						int(progress.get("progress", 0)),
						int(job.get("goal", 0)),
					])
			native_app_body.text = "%s\n\nLOCAL WORK ORDERS\n%s\n\nProgress is saved locally; work orders have no separate payout." % [
				location,
				"\n".join(job_lines),
			]
			native_app_footer.text = "1–2 START / SWITCH ORDER  ·  ESC CLOSE"
		"pest_uniform":
			native_app_title.text = "PEST RESPONSE UNIFORM"
			native_app_body.text = "%s\n\nUNIFORM %s\nStamina  %d%%\n\nWear the issued uniform before starting a pest work order." % [
				location,
				"ON" if bool(office.get("pestUniformWorn", false)) else "OFF",
				int(office.get("pestStamina", 0)),
			]
			native_app_footer.text = "1 TOGGLE UNIFORM  ·  ESC CLOSE"
		"melee":
			native_app_title.text = "NON-GRAPHIC MELEE"
			var moves: Variant = office.get("meleeMoves", [])
			var move_lines: Array[String] = []
			if moves is Array:
				for index in moves.size():
					var move_value: Variant = moves[index]
					if not move_value is Dictionary:
						continue
					var move: Dictionary = move_value
					var cost := "%d STA" % int(move.get("stamina", 0))
					if bool(move.get("toolRequired", false)):
						cost = "REQUIRES EQUIPPED TOOL"
					move_lines.append("%d  %s  ·  %s" % [
						index + 1,
						str(move.get("label", "MOVE")),
						cost,
					])
			native_app_body.text = "Choose a move for the nearest active pest.\n\n%s\n\nNo graphic effects are shown." % "\n".join(move_lines)
			native_app_footer.text = "1–9 SELECT MOVE  ·  ESC CLOSE"
		"inventory":
			native_app_title.text = "STAMINA SUPPLIES"
			var supplies: Variant = office.get("staminaSupplies", [])
			var supply_lines: Array[String] = []
			if supplies is Array:
				for index in supplies.size():
					var supply_value: Variant = supplies[index]
					if not supply_value is Dictionary:
						continue
					var supply: Dictionary = supply_value
					supply_lines.append("%d  %s  ×%d" % [
						index + 1,
						str(supply.get("itemId", "SUPPLY")).replace("_", " ").to_upper(),
						int(supply.get("quantity", 0)),
					])
			native_app_body.text = "Linked game inventory · stamina items\n\n%s" % (
				"\n".join(supply_lines) if not supply_lines.is_empty() else "No stamina supplies in this character slot."
			)
			native_app_footer.text = "SELECT A NUMBER TO USE  ·  ESC CLOSE"
		"settings":
			native_app_title.text = "PLAYER SETTINGS"
			native_app_body.text = "%s\n\nMUSIC %s\nNearby basement pests trigger a quiet, distance-faded cue when enabled.\n\nMUSIC starts OFF." % [
				location,
				"ON" if bool(office.get("musicEnabled", false)) else "OFF",
			]
			native_app_footer.text = "4 OR O TO TOGGLE MUSIC  ·  ESC CLOSE"
		"utility_work":
			native_app_title.text = "TOWER INFRASTRUCTURE / REPAIR ROUTES"
			native_app_body.add_theme_font_size_override("font_size", 12)
			native_app_body.text = "\n".join([
				location,
				"",
				"%s MAINTENANCE" % str(office.get("utilityWorkTarget", "TOWER")).to_upper(),
				"Server-authoritative repair is running. Remain at the station until it is confirmed complete.",
				"",
				"B5 POWER ─────────────┐",
				"B6 WATER + FIRE PIPE ─┼─ SERVICE-ELEVATOR WALL RISER",
				"B3 FIRE ALARM ────────┘              │",
				"                                     ├─ FLOORS 01–67 / 622 × 707 m / OFFICE BRANCHES",
				"                                     ├─ LOBBY / PERIMETER ROUTE",
				"                                     ├─ B1 / 566 × 283 m / BUSINESS + OPEN-AIR YARD",
				"                                     └─ B2–B6 / 283 × 283 m / PERIMETER ROUTE",
				"",
				"The 12 cm wall cavity has separate electrical, water, alarm, and suppression lanes.",
			])
			native_app_footer.text = "TRACE THE SERVICE-ELEVATOR WALL / WAIT FOR SERVER CONFIRMATION"
		"company_relocation":
			native_app_title.text = "COMPANY RELOCATION"
			native_app_body.text = "Your team is preparing to move.\n\nDESTINATION NOT DISCLOSED\n\nThe location will not be shown in this sequence."
			native_app_footer.text = "WAIT FOR THE RELOCATION SEQUENCE"
		_:
			native_app_title.text = page_source.to_upper() if not page_source.is_empty() else page.to_upper()
			native_app_body.text = location + "\n\nThis view is rendered by the game client."
			native_app_footer.text = "ESC CLOSE"


func _active_page_name() -> String:
	var office: Dictionary = snapshot.get("office", {})
	var page_value: Variant = office.get("activePage")
	return "" if page_value == null else str(page_value)


static func terminal_choice_for_key(keycode: int) -> int:
	match keycode:
		KEY_1:
			return 1
		KEY_2:
			return 2
		KEY_3:
			return 3
		KEY_4:
			return 4
		KEY_5:
			return 5
		KEY_6:
			return 6
		KEY_7:
			return 7
		KEY_8:
			return 8
		KEY_9:
			return 9
	return 0


func _send_command(name: String, payload: Dictionary = {}) -> String:
	if connection.get_status() != StreamPeerTCP.STATUS_CONNECTED:
		return ""
	command_sequence += 1
	var command_id := "godot-%d" % command_sequence
	var message := {
		"type": "command",
		"version": PROTOCOL_VERSION,
		"id": command_id,
		"name": name,
		"payload": payload,
	}
	connection.put_data((JSON.stringify(message) + "\n").to_utf8_buffer())
	return command_id


func _input(event: InputEvent) -> void:
	if (
		PlayerController.is_jump_input(event)
		and _active_page_name().is_empty()
		and not elevator_transition_active
		and (native_app_panel == null or not native_app_panel.visible)
		and (elevator_floor_panel == null or not elevator_floor_panel.visible)
	):
		player_root.try_jump()
		get_viewport().set_input_as_handled()
		return
	if event is InputEventKey and event.pressed and not event.echo:
		if _handle_elevator_picker_key(event.keycode):
			get_viewport().set_input_as_handled()
			return
		var active_page := _active_page_name()
		if not active_page.is_empty():
			if event.keycode == KEY_ESCAPE:
				var office: Dictionary = snapshot.get("office", {})
				if (
					not bool(office.get("utilityWorkActive", false))
					and not bool(office.get("relocationCutscenePending", false))
				):
					_send_command("close_page")
			elif active_page == "merchant":
				if event.keycode == KEY_1:
					ghost_dialogue_line = "I advised Pablo on security once. That ended years ago."
				elif event.keycode == KEY_2:
					ghost_dialogue_line = "I stand where people expect a worker. The rest is timing."
				elif event.keycode == KEY_3:
					_send_command("close_page")
			elif active_page == "systems":
				var choice := terminal_choice_for_key(event.keycode)
				if choice > 0:
					_send_command("terminal_choice", {"choice": choice})
			elif active_page in ["vending", "business_stock"] and event.keycode == KEY_B:
				_send_command("toggle_business_stock")
			elif active_page == "vending" and event.keycode in [
				KEY_1, KEY_2, KEY_3, KEY_4, KEY_5
			]:
				var item_index := int(event.keycode) - KEY_1
				var office: Dictionary = snapshot.get("office", {})
				var vending_value: Variant = office.get("vendingCatalog", [])
				if vending_value is Array and item_index < vending_value.size():
					var item_value: Variant = vending_value[item_index]
					if item_value is Dictionary:
						_send_command("buy_vending", {"item_id": str(item_value.get("id", ""))})
			elif active_page == "reception" and event.keycode in [KEY_1, KEY_2, KEY_3]:
				_send_command("reception_choice", {"choice": event.keycode - KEY_0})
			elif active_page == "pest_jobs" and event.keycode in [KEY_1, KEY_2]:
				var job_id := "pest_w2" if event.keycode == KEY_1 else "pest_1099"
				_send_command("start_pest_job", {"job_id": job_id})
			elif active_page == "pest_uniform" and event.keycode == KEY_1:
				_send_command("toggle_pest_uniform")
			elif active_page == "melee":
				var move_index: int = int(event.keycode) - KEY_1
				var office: Dictionary = snapshot.get("office", {})
				var moves: Variant = office.get("meleeMoves", [])
				if moves is Array and move_index >= 0 and move_index < moves.size():
					var move: Variant = moves[move_index]
					if move is Dictionary:
						_send_command("basement_attack", {"move_id": str(move.get("id", ""))})
			elif active_page == "inventory" and event.keycode in [
				KEY_1, KEY_2, KEY_3, KEY_4, KEY_5, KEY_6, KEY_7, KEY_8
			]:
				var item_id := _stamina_supply_item_at(event.keycode - KEY_1)
				if not item_id.is_empty():
					_send_command("use_pest_supply", {"item_id": item_id})
			elif active_page == "settings" and event.keycode in [KEY_4, KEY_O]:
				_send_command("toggle_music")
			get_viewport().set_input_as_handled()
			return
		if elevator_transition_active:
			get_viewport().set_input_as_handled()
			return
		var scene_data: Dictionary = snapshot.get("scene", {})
		if event.keycode == KEY_M \
			and int(scene_data.get("floor", 1)) == 7 \
			and str(scene_data.get("room", "")) == "floor07_business":
			_toggle_temple_music()
			get_viewport().set_input_as_handled()
			return
		if event.keycode == KEY_O:
			_send_command("toggle_music")
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
			KEY_F:
				if str(snapshot.get("scene", {}).get("room", "")).begins_with("basement_b"):
					_send_command("open_melee_menu")
				else:
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
			KEY_Z, KEY_EQUAL, KEY_KP_ADD:
				_step_camera_zoom(-1)
			KEY_X, KEY_MINUS, KEY_KP_SUBTRACT:
				_step_camera_zoom(1)
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
		if event.button_index == MOUSE_BUTTON_LEFT and _active_page_name().is_empty():
			if str(snapshot.get("scene", {}).get("room", "")).begins_with("basement_b"):
				_send_command("open_melee_menu")
			else:
				player_root.try_fight()
		elif event.button_index == MOUSE_BUTTON_RIGHT:
			player_root.try_sweep()
		elif event.button_index == MOUSE_BUTTON_MIDDLE and _active_page_name().is_empty():
			player_root.toggle_mouse_sprint()
			get_viewport().set_input_as_handled()
		elif event.button_index == MOUSE_BUTTON_WHEEL_UP:
			_step_camera_zoom(-1)


func _stamina_supply_item_at(index: int) -> String:
	var office: Dictionary = snapshot.get("office", {})
	var supplies: Variant = office.get("staminaSupplies", [])
	if not supplies is Array or index < 0 or index >= supplies.size():
		return ""
	var supply: Variant = supplies[index]
	if not supply is Dictionary:
		return ""
	return str(supply.get("itemId", ""))


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