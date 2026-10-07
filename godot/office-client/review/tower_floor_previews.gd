extends SceneTree
## Godot-rendered, isometric Tower floor dioramas for visual review.
## Uses the Tower floor-plan JSON and the office client's native 3D props.

const Prop = preload("res://office_prop.gd")
const Service = preload("res://office_service_prop.gd")

const FLOOR_TOP := 0.14
const WALL_HEIGHT := 2.35
const WALL_THICKNESS := 0.3
const STANDARD_SCALE := 0.01
const BASEMENT_SCALE := 0.01
const LOBBY_SCALE := 0.01

const PALETTE := {
	"lobby": "#3d655a",
	"hall": "#415965",
	"temple": "#9baa87",
	"construction": "#70685b",
	"office_1": "#8f6e8f",
	"office_2": "#3e8790",
	"office_3": "#60759e",
	"office_4": "#ad7890",
	"wall": "#35574a",
	"wall_dark": "#263a35",
	"brass": "#ad884e",
	"cream": "#dfd1af",
	"dark": "#242b28",
	"metal": "#59645e",
	"wood": "#78523b",
	"rug": "#78604c",
	"water": "#537d83",
	"power": "#8a764b",
	"alert": "#9b5544",
}

var plan: Dictionary
var materials: Dictionary = {}
var scene_world: Node3D
var active_floor: Node3D
var camera: Camera3D
var title_label: Label
var subtitle_label: Label
var output_directory := ""
var failed := false


func _initialize() -> void:
	call_deferred("_capture_all")


func _capture_all() -> void:
	var args := OS.get_cmdline_user_args()
	if args.is_empty():
		push_error("Pass an absolute output directory as the first user argument.")
		quit(1)
		return
	output_directory = args[0]
	DirAccess.make_dir_recursive_absolute(output_directory)

	var raw_plan := FileAccess.get_file_as_string("res://floor_plan.json")
	var parsed: Variant = JSON.parse_string(raw_plan)
	if not parsed is Dictionary:
		push_error("Could not read res://floor_plan.json.")
		quit(1)
		return
	plan = parsed

	_create_review_scene()
	var jobs: Array[Dictionary] = []
	for basement in range(1, 7):
		jobs.append({"id": "B%d" % basement, "floor": 0, "basement": basement})
	for floor_number in range(1, 13):
		jobs.append({"id": "F%d" % floor_number, "floor": floor_number, "basement": 0})

	for job in jobs:
		print("Preparing native Tower preview: ", job["id"])
		active_floor = Node3D.new()
		active_floor.name = "Preview_%s" % job["id"]
		scene_world.add_child(active_floor)
		_render_floor(active_floor, job)
		_update_camera(job)
		title_label.text = "SALARYMAN OS  /  TOWER %s" % job["id"]
		subtitle_label.text = _subtitle_for(job)
		for frame in range(4):
			await process_frame
		await RenderingServer.frame_post_draw
		var image := root.get_texture().get_image()
		var filename := "%s.png" % str(job["id"]).to_lower()
		var output_path := output_directory.path_join(filename)
		var result := image.save_png(output_path)
		print("Godot 3D floor preview: ", output_path, " (", result, ")")
		if result != OK:
			failed = true
		active_floor.queue_free()
		await process_frame

	quit(1 if failed else 0)


func _create_review_scene() -> void:
	scene_world = Node3D.new()
	scene_world.name = "TowerFloorReview"
	root.add_child(scene_world)

	var environment := WorldEnvironment.new()
	environment.environment = Environment.new()
	environment.environment.background_mode = Environment.BG_COLOR
	environment.environment.background_color = Color("#1a2623")
	environment.environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.environment.ambient_light_color = Color("#dbd3bc")
	environment.environment.ambient_light_energy = 0.72
	scene_world.add_child(environment)

	var sunlight := DirectionalLight3D.new()
	sunlight.rotation_degrees = Vector3(-55, -28, 0)
	sunlight.light_color = Color("#ffe2b2")
	sunlight.light_energy = 1.05
	sunlight.shadow_enabled = true
	scene_world.add_child(sunlight)

	camera = Camera3D.new()
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.near = 0.05
	camera.far = 250.0
	scene_world.add_child(camera)
	camera.current = true

	var overlay := CanvasLayer.new()
	root.add_child(overlay)
	title_label = Label.new()
	title_label.position = Vector2(42, 32)
	title_label.add_theme_font_size_override("font_size", 27)
	title_label.add_theme_color_override("font_color", Color("#f0e3c7"))
	overlay.add_child(title_label)
	subtitle_label = Label.new()
	subtitle_label.position = Vector2(42, 76)
	subtitle_label.add_theme_font_size_override("font_size", 17)
	subtitle_label.add_theme_color_override("font_color", Color("#c9b995"))
	overlay.add_child(subtitle_label)
	var footer := Label.new()
	footer.text = "GODOT 3D REVIEW RENDER  ·  NATIVE TOWER PROPS  ·  NOT GAMEPLAY FOOTAGE"
	footer.position = Vector2(42, 1012)
	footer.add_theme_font_size_override("font_size", 15)
	footer.add_theme_color_override("font_color", Color("#c9b995"))
	overlay.add_child(footer)


func _render_floor(parent: Node3D, job: Dictionary) -> void:
	var is_basement: bool = int(job["basement"]) > 0
	var floor_number: int = int(job["floor"])
	var basement_number: int = int(job["basement"])
	var floor_data: Dictionary = {}
	var room_id := ""
	var label := ""
	var room_material := "hall"
	var scale_factor := STANDARD_SCALE
	var bounds: Array = []
	var origin := Vector2.ZERO

	if is_basement:
		room_id = "basement_b%d" % basement_number
		label = "BASEMENT B%d" % basement_number
		scale_factor = STANDARD_SCALE if basement_number == 1 else BASEMENT_SCALE
		var basement_program: Dictionary = plan.get("floorProgram", {}).get("pabloCorpBusinessArea", {})
		var basement_labels := {
			1: "OPERATIONS + LOADING YARD",
			2: "COLLECTIONS · SECURITY · CELLS",
			3: "DISASTER RESPONSE · FIRE · MAINTENANCE",
			4: "VITAL SUPPLIES STORAGE",
			5: "POWER STATION · BACKUP GENERATORS",
			6: "WATER PUMPING · PLUMBING",
		}
		label = "%s  /  %s" % [label, basement_labels[basement_number]]
		if basement_number == 1:
			floor_data = {"businesses": basement_program.get("b1Businesses", [])}
	else:
		floor_data = plan.get("playableFloors", {}).get(str(floor_number), {})
		room_id = str(floor_data.get("room", ""))
		label = str(floor_data.get("label", "FLOOR %02d" % floor_number))
		if floor_number == 1:
			scale_factor = LOBBY_SCALE

	var room_spec := _find_room(room_id)
	if room_spec.is_empty():
		push_error("Missing floor-plan room: " + room_id)
		failed = true
		return
	bounds = room_spec.get("bounds", [])
	if bounds.size() < 4:
		push_error("Missing bounds for floor-plan room: " + room_id)
		failed = true
		return

	if floor_number == 1:
		var base_layout: Dictionary = plan.get("baseLayout", {})
		var lobby: Dictionary = base_layout.get("elevatorLobby", {})
		bounds = lobby.get("bounds", bounds)
		var hallways: Array = base_layout.get("hallways", [])
		if bounds.size() >= 4 and not hallways.is_empty():
			var main_hall: Array = hallways[0]
			var opening_center_x := int(bounds[0]) + int(plan.get("lobbyHallwayOpening", 0))
			var hallway_center_x := int(main_hall[0]) + int(main_hall[2]) / 2
			origin = Vector2(
				float(opening_center_x - hallway_center_x),
				float(int(bounds[1]) + int(bounds[3])),
			)
		room_material = "lobby"
	elif floor_number == 7:
		room_material = "temple"
	elif floor_number >= 2 and floor_number <= 5:
		room_material = "construction"
	else:
		room_material = str(room_spec.get("material", "hall")) \
			if str(room_spec.get("material", "")) != "hall_floor" else "hall"

	var x0 := (float(bounds[0]) - origin.x) * scale_factor
	var z0 := (float(bounds[1]) - origin.y) * scale_factor
	var width := float(bounds[2]) * scale_factor
	var depth := float(bounds[3]) * scale_factor
	var floor_rect := Rect2(x0, z0, width, depth)

	_add_floor_slab(parent, floor_rect, room_material)
	if floor_number == 1:
		_add_lobby_shell(parent, floor_rect)
	elif is_basement and basement_number == 1:
		_add_b1_shell(parent, floor_rect, scale_factor)
	else:
		_add_outer_shell(parent, floor_rect)

	if floor_number >= 2 and floor_number <= 12:
		_add_standard_hallways(parent, scale_factor)
	if floor_number == 1:
		_add_lobby(parent, floor_rect, scale_factor, origin)
	elif floor_number == 6:
		_add_first_office_floor(parent, scale_factor)
	elif floor_number == 7:
		_add_temple(parent, floor_data, scale_factor)
	elif floor_number >= 2 and floor_number <= 5:
		_add_business_suites(parent, floor_data, scale_factor, true)
	elif floor_number >= 8 and floor_number <= 12:
		_add_business_suites(parent, floor_data, scale_factor, false)
	elif is_basement and basement_number == 1:
		_add_b1(parent, floor_data, scale_factor)
	elif is_basement:
		_add_other_basement(parent, basement_number, scale_factor)

	if floor_number != 1 and floor_number != 6:
		_add_hall_fixtures(parent, floor_number, basement_number, scale_factor, origin)

	if floor_number == 12:
		_add_interior_props(parent, floor_data.get("interiorProps", []), scale_factor)

	if floor_number == 7:
		_add_interior_props(parent, floor_data.get("interiorProps", []), scale_factor)

	if is_basement:
		var room_name := "B%d" % basement_number
		_add_floor_marker(parent, room_name, floor_rect.position + floor_rect.size * 0.5)
	elif floor_number > 1:
		_add_floor_marker(parent, "F%02d" % floor_number, floor_rect.position + floor_rect.size * 0.5)

	# Text shown in the screenshot uses the canonical floor labels.
	if is_basement:
		title_label.text = "SALARYMAN OS  /  TOWER B%d" % basement_number
	else:
		title_label.text = "SALARYMAN OS  /  TOWER F%02d" % floor_number
	subtitle_label.text = label


func _find_room(room_id: String) -> Dictionary:
	for room_value in plan.get("rooms", []):
		var room: Dictionary = room_value
		if str(room.get("id", "")) == room_id:
			return room
	return {}


func _add_floor_slab(parent: Node3D, rect: Rect2, material_name: String) -> void:
	var center := Vector3(rect.position.x + rect.size.x * 0.5, 0.0, rect.position.y + rect.size.y * 0.5)
	_box(parent, center + Vector3(0, -0.22, 0), Vector3(rect.size.x + 0.48, 0.32, rect.size.y + 0.48), Color("#263a35"), "dark")
	_box(parent, center + Vector3(0, -0.025, 0), Vector3(rect.size.x, 0.12, rect.size.y), _floor_color(material_name), "floor_" + material_name)
	_add_box(parent, center + Vector3(0, -0.18, rect.size.y * 0.5 + 0.12), Vector3(rect.size.x + 0.15, 0.08, 0.08), Color(PALETTE["brass"]), "floor_edge")


func _add_outer_shell(parent: Node3D, rect: Rect2) -> void:
	var left := rect.position.x
	var right := rect.position.x + rect.size.x
	var front := rect.position.y + rect.size.y
	var back := rect.position.y
	_wall_h(parent, left, right, back, Color(PALETTE["wall_dark"]), WALL_HEIGHT, "rear_wall")
	_add_windowed_side_wall(parent, left, back, front, "left_wall")
	_add_windowed_side_wall(parent, right, back, front, "right_wall")
	# Cut away the near wall so the whole 3D miniature reads clearly.
	_wall_h(parent, left, right, front, Color(PALETTE["wall_dark"]), 0.52, "cutaway_wall")
	_add_box(parent, Vector3((left + right) * 0.5, WALL_HEIGHT + 0.02, back), Vector3(rect.size.x, 0.055, 0.18), Color(PALETTE["brass"]), "rear_brass_cap")
	_add_box(parent, Vector3(left, WALL_HEIGHT + 0.02, (back + front) * 0.5), Vector3(0.18, 0.055, rect.size.y), Color(PALETTE["brass"]), "left_brass_cap")
	_add_box(parent, Vector3(right, WALL_HEIGHT + 0.02, (back + front) * 0.5), Vector3(0.18, 0.055, rect.size.y), Color(PALETTE["brass"]), "right_brass_cap")
	for x in [left + 0.14, right - 0.14]:
		_add_box(parent, Vector3(x, 1.1, back + 0.14), Vector3(0.055, 2.1, 0.055), Color("#78917b"), "wall_rib")


func _add_windowed_side_wall(parent: Node3D, x: float, back: float, front: float, key: String) -> void:
	var cursor := back
	var window_width := 3.2
	for index in range(1, 7):
		var center := lerpf(back, front, float(index) / 7.0)
		var opening_top := center - window_width * 0.5
		var opening_bottom := center + window_width * 0.5
		_wall_v(parent, x, cursor, opening_top, Color(PALETTE["wall"]), WALL_HEIGHT, "%s_segment" % key)
		_add_glass_pane(
			parent,
			Vector3(x, 1.48, center),
			Vector3(WALL_THICKNESS, 1.18, window_width),
			"%s_glass" % key,
		)
		_add_box(parent, Vector3(x, 2.08, center), Vector3(WALL_THICKNESS + 0.1, 0.1, window_width + 0.1), Color(PALETTE["brass"]), "%s_window_header" % key)
		_add_box(parent, Vector3(x, 0.88, center), Vector3(WALL_THICKNESS + 0.1, 0.1, window_width + 0.1), Color(PALETTE["brass"]), "%s_window_sill" % key)
		cursor = opening_bottom
	_wall_v(parent, x, cursor, front, Color(PALETTE["wall"]), WALL_HEIGHT, "%s_end" % key)


func _add_glass_pane(parent: Node3D, at: Vector3, size: Vector3, key: String) -> void:
	var mesh := BoxMesh.new()
	mesh.size = size
	var material := StandardMaterial3D.new()
	material.albedo_color = Color(0.42, 0.69, 0.74, 0.52)
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.roughness = 0.18
	mesh.material = material
	var pane := MeshInstance3D.new()
	pane.mesh = mesh
	pane.position = at
	pane.name = key
	parent.add_child(pane)


func _add_lobby_shell(parent: Node3D, rect: Rect2) -> void:
	var left := rect.position.x
	var right := rect.position.x + rect.size.x
	var back := rect.position.y
	var front := rect.position.y + rect.size.y
	var opening_offset := float(plan.get("lobbyHallwayOpening", 0)) * LOBBY_SCALE
	var opening_center := left + opening_offset
	var opening_width := 1.8
	_wall_h(parent, left, right, back, Color(PALETTE["wall_dark"]), WALL_HEIGHT, "lobby_back_wall")
	_add_windowed_side_wall(parent, left, back, front, "lobby_left_wall")
	_add_windowed_side_wall(parent, right, back, front, "lobby_right_wall")
	_wall_h(parent, left, opening_center - opening_width * 0.5, front, Color(PALETTE["wall_dark"]), 0.52, "lobby_entry_left")
	_wall_h(parent, opening_center + opening_width * 0.5, right, front, Color(PALETTE["wall_dark"]), 0.52, "lobby_entry_right")
	_add_box(parent, Vector3(opening_center - opening_width * 0.5, 1.12, front), Vector3(0.12, 2.24, 0.12), Color(PALETTE["brass"]), "lobby_entry_frame_left")
	_add_box(parent, Vector3(opening_center + opening_width * 0.5, 1.12, front), Vector3(0.12, 2.24, 0.12), Color(PALETTE["brass"]), "lobby_entry_frame_right")


func _add_b1_shell(parent: Node3D, rect: Rect2, scale_factor: float) -> void:
	var b1: Dictionary = plan.get("businessSuiteLayout", {}).get("b1", {})
	var interior: Array = b1.get("interiorBusinessHalf", [])
	var access: Array = b1.get("yardAccess", [])
	var exterior_gate: Array = b1.get("exteriorGate", [])
	if interior.size() < 4 or access.size() < 2 or exterior_gate.size() < 2:
		return
	var left := rect.position.x
	var right := rect.position.x + rect.size.x
	var top := rect.position.y
	var bottom := rect.position.y + rect.size.y
	var divider_x := left + float(int(interior[0]) + int(interior[2])) * scale_factor
	var access_z := top + float(access[1]) * scale_factor
	var exterior_gate_z := top + float(exterior_gate[1]) * scale_factor
	var gate_half_width := 1.5
	_wall_v(parent, left, top, bottom, Color(PALETTE["wall"]), WALL_HEIGHT, "b1_business_outer_wall")
	_wall_h(parent, left, divider_x, top, Color(PALETTE["wall_dark"]), WALL_HEIGHT, "b1_business_back_wall")
	_wall_h(parent, left, divider_x, bottom, Color(PALETTE["wall_dark"]), WALL_HEIGHT, "b1_business_front_wall")
	_add_preview_fence_v(parent, divider_x, top, access_z - gate_half_width, "b1_divider_north")
	_add_preview_fence_v(parent, divider_x, access_z + gate_half_width, bottom, "b1_divider_south")
	_add_preview_fence_h(parent, divider_x, right, top, "b1_yard_back_fence")
	_add_preview_fence_h(parent, divider_x, right, bottom, "b1_yard_front_fence")
	_add_preview_fence_v(parent, right, top, exterior_gate_z - gate_half_width, "b1_yard_gate_north")
	_add_preview_fence_v(parent, right, exterior_gate_z + gate_half_width, bottom, "b1_yard_gate_south")


func _add_preview_fence_h(parent: Node3D, left: float, right: float, z: float, key: String) -> void:
	if right <= left:
		return
	for rail in [{"name": "lower", "height": 0.28}, {"name": "middle", "height": 0.72}, {"name": "upper", "height": 1.28}]:
		_add_box(parent, Vector3((left + right) * 0.5, rail["height"], z), Vector3(right - left, 0.07, 0.07), Color(PALETTE["metal"]), key + "_" + rail["name"])
	for index in range(int((right - left) / 6.0) + 2):
		var x := left + minf(float(index) * 6.0, right - left)
		_add_box(parent, Vector3(x, 0.68, z), Vector3(0.09, 1.36, 0.09), Color(PALETTE["metal"]), key + "_post")


func _add_preview_fence_v(parent: Node3D, x: float, top: float, bottom: float, key: String) -> void:
	if bottom <= top:
		return
	for rail in [{"name": "lower", "height": 0.28}, {"name": "middle", "height": 0.72}, {"name": "upper", "height": 1.28}]:
		_add_box(parent, Vector3(x, rail["height"], (top + bottom) * 0.5), Vector3(0.07, 0.07, bottom - top), Color(PALETTE["metal"]), key + "_" + rail["name"])
	for index in range(int((bottom - top) / 6.0) + 2):
		var z := top + minf(float(index) * 6.0, bottom - top)
		_add_box(parent, Vector3(x, 0.68, z), Vector3(0.09, 1.36, 0.09), Color(PALETTE["metal"]), key + "_post")


func _add_standard_hallways(parent: Node3D, scale_factor: float) -> void:
	for index in range(3):
		var b: Array = plan["baseLayout"]["hallways"][index]
		var rect := Rect2(float(b[0]) * scale_factor, float(b[1]) * scale_factor, float(b[2]) * scale_factor, float(b[3]) * scale_factor)
		var center := Vector3(rect.position.x + rect.size.x * 0.5, FLOOR_TOP + 0.012, rect.position.y + rect.size.y * 0.5)
		_add_box(parent, center, Vector3(rect.size.x, 0.035, rect.size.y), Color("#344b4b"), "hallway_inlay")
	for point in plan["baseLayout"]["passengerElevators"]["positions"]:
		_add_elevator(parent, Vector2(float(point[0]) * scale_factor, float(point[1]) * scale_factor), scale_factor, false)
	var service_position: Array = plan["baseLayout"]["serviceElevator"]["position"]
	_add_elevator(parent, Vector2(float(service_position[0]) * scale_factor, float(service_position[1]) * scale_factor), scale_factor, true)


func _add_elevator(parent: Node3D, position: Vector2, scale_factor: float, service: bool) -> void:
	var size := Vector3(0.82 if not service else 0.72, 1.7, 0.70 if not service else 0.82)
	_add_box(parent, Vector3(position.x, 0.98, position.y), size, Color(PALETTE["wall_dark"]), "service_elevator" if service else "passenger_elevator")
	_add_box(parent, Vector3(position.x, 1.0, position.y + size.z * 0.51), Vector3(size.x * 0.76, 1.3, 0.035), Color(PALETTE["brass"]), "elevator_door")
	_add_box(parent, Vector3(position.x, 1.0, position.y + size.z * 0.54), Vector3(size.x * 0.42, 1.2, 0.024), Color("#526c60"), "elevator_panel")


func _add_business_suites(parent: Node3D, floor_data: Dictionary, scale_factor: float, under_construction: bool) -> void:
	var layout: Dictionary = plan.get("businessSuiteLayout", {})
	var key := str(floor_data.get("suiteLayout", "standardFloorUnits"))
	var units: Array = layout.get(key, layout.get("standardFloorUnits", []))
	var businesses: Array = floor_data.get("businesses", [])
	var business_by_unit: Dictionary = {}
	for business_value in businesses:
		var business: Dictionary = business_value
		business_by_unit[int(business.get("unitNumber", 0))] = business

	for unit_value in units:
		var unit: Dictionary = unit_value
		var unit_number := int(unit.get("unitNumber", 0))
		if not business_by_unit.has(unit_number):
			continue
		var business: Dictionary = business_by_unit[unit_number]
		var bounds: Array = unit.get("bounds", [])
		if bounds.size() < 4:
			continue
		_draw_suite(parent, bounds, str(unit.get("doorSide", "south")), scale_factor, str(business.get("label", "BUSINESS")), under_construction)


func _draw_suite(parent: Node3D, bounds: Array, door_side: String, scale_factor: float, label: String, under_construction: bool) -> void:
	var x0 := float(bounds[0]) * scale_factor
	var z0 := float(bounds[1]) * scale_factor
	var width := float(bounds[2]) * scale_factor
	var depth := float(bounds[3]) * scale_factor
	var x1 := x0 + width
	var z1 := z0 + depth
	var wall_color := Color("#635c50") if under_construction else Color(PALETTE["wall"])
	var wall_height := 1.55 if under_construction else 1.95
	_wall_v(parent, x0, z0, z1, wall_color, wall_height, "suite_partition")
	_wall_v(parent, x1, z0, z1, wall_color, wall_height, "suite_partition")
	var gap := minf(1.25, width * 0.42)
	if door_side == "south":
		_wall_h_with_gap(parent, x0, x1, z0, wall_color, wall_height, x0 + width * 0.5, gap, "suite_front")
		_wall_h(parent, x0, x1, z1, wall_color, wall_height, "suite_back")
	else:
		_wall_h(parent, x0, x1, z0, wall_color, wall_height, "suite_back")
		_wall_h_with_gap(parent, x0, x1, z1, wall_color, wall_height, x0 + width * 0.5, gap, "suite_front")

	var desk_scale := 0.62 if width < 3.0 else 0.82
	if under_construction:
		_add_scaffold_posts(parent, x0, z0, width, depth, wall_height)
		if int(roundf(x0 * 100.0)) == 0:
			_place_prop(parent, "desk", Vector3(x0 + width * 0.5, FLOOR_TOP, z0 + depth * 0.60), desk_scale)
	else:
		_place_prop(parent, "desk", Vector3(x0 + width * 0.5, FLOOR_TOP, z0 + depth * 0.57), desk_scale)
		_place_prop(parent, "chair", Vector3(x0 + width * 0.5, FLOOR_TOP, z0 + depth * 0.72), 0.76)
		_place_prop(parent, "telephone", Vector3(x0 + width * 0.28, FLOOR_TOP, z0 + depth * 0.57), 0.72)
		_place_prop(parent, "desk_lamp", Vector3(x0 + width * 0.70, FLOOR_TOP, z0 + depth * 0.57), 0.74)
	var sign_z := z0 + 0.12 if door_side == "south" else z1 - 0.12
	_add_nameplate(parent, label, Vector3(x0 + width * 0.5, wall_height + 0.26, sign_z), width)


func _add_scaffold_posts(parent: Node3D, x0: float, z0: float, width: float, depth: float, height: float) -> void:
	for x in [x0 + 0.08, x0 + width - 0.08]:
		for z in [z0 + 0.08, z0 + depth - 0.08]:
			_add_box(parent, Vector3(x, height * 0.5, z), Vector3(0.065, height, 0.065), Color(PALETTE["brass"]), "unfinished_post")
	for z in [z0 + 0.18, z0 + depth - 0.18]:
		_add_box(parent, Vector3(x0 + width * 0.5, 1.25, z), Vector3(width * 0.8, 0.045, 0.045), Color("#8b7962"), "unfinished_brace")


func _add_first_office_floor(parent: Node3D, scale_factor: float) -> void:
	var offices: Array = plan["baseLayout"]["offices"]
	var businesses: Array = plan["playableFloors"]["6"]["businesses"]
	var by_room: Dictionary = {}
	for business_value in businesses:
		var business: Dictionary = business_value
		var room := str(business.get("officeRoom", ""))
		if not by_room.has(room):
			by_room[room] = []
		by_room[room].append(business)

	for office_value in offices:
		var office: Dictionary = office_value
		var bounds: Array = office.get("bounds", [])
		var room := str(office.get("id", ""))
		var material_name := "office_1"
		match room:
			"public": material_name = "office_2"
			"office_03": material_name = "office_3"
			"office_04": material_name = "office_4"
		var patch := Rect2(float(bounds[0]) * scale_factor, float(bounds[1]) * scale_factor, float(bounds[2]) * scale_factor, float(bounds[3]) * scale_factor)
		_add_box(parent, Vector3(patch.position.x + patch.size.x * 0.5, FLOOR_TOP + 0.018, patch.position.y + patch.size.y * 0.5), Vector3(patch.size.x, 0.035, patch.size.y), _floor_color(material_name), "office_floor_" + room)
		_draw_office_shell(parent, patch, str(office.get("doorSide", "south")))
		var halves: Array = by_room.get(room, [])
		var half_width := patch.size.x * 0.5
		for index in range(halves.size()):
			var business: Dictionary = halves[index]
			var center_x := patch.position.x + half_width * (float(index) + 0.5)
			_place_prop(parent, "desk", Vector3(center_x, FLOOR_TOP, patch.position.y + patch.size.y * 0.56), 0.72)
			_place_prop(parent, "chair", Vector3(center_x, FLOOR_TOP, patch.position.y + patch.size.y * 0.72), 0.7)
			_add_nameplate(parent, str(business.get("label", "")), Vector3(center_x, 2.25, patch.position.y + (0.15 if office.get("doorSide", "south") == "south" else patch.size.y - 0.15)), half_width)

	# The central elevator court is a clear, darker concourse.
	for position in plan["baseLayout"]["stairs"]["positions"]:
		var stair_x := float(position[0]) * scale_factor
		var stair_z := float(position[1]) * scale_factor
		_add_box(parent, Vector3(stair_x, 0.65, stair_z), Vector3(0.9, 1.0, 1.1), Color(PALETTE["wood"]), "stair_landing")
		_add_box(parent, Vector3(stair_x, 1.18, stair_z), Vector3(0.9, 0.06, 1.1), Color(PALETTE["brass"]), "stair_rail")


func _draw_office_shell(parent: Node3D, rect: Rect2, door_side: String) -> void:
	var x0 := rect.position.x
	var z0 := rect.position.y
	var x1 := x0 + rect.size.x
	var z1 := z0 + rect.size.y
	_wall_v(parent, x0, z0, z1, Color(PALETTE["wall"]), 1.95, "office_wall")
	_wall_v(parent, x1, z0, z1, Color(PALETTE["wall"]), 1.95, "office_wall")
	if door_side == "south":
		_wall_h(parent, x0, x1, z0, Color(PALETTE["wall"]), 1.95, "office_wall")
		_wall_h_with_gap(parent, x0, x1, z1, Color(PALETTE["wall"]), 1.95, x0 + rect.size.x * 0.5, 1.4, "office_door")
	else:
		_wall_h_with_gap(parent, x0, x1, z0, Color(PALETTE["wall"]), 1.95, x0 + rect.size.x * 0.5, 1.4, "office_door")
		_wall_h(parent, x0, x1, z1, Color(PALETTE["wall"]), 1.95, "office_wall")


func _add_temple(parent: Node3D, floor_data: Dictionary, scale_factor: float) -> void:
	for x in [5.5, 11.0, 16.5]:
		_add_box(parent, Vector3(x, FLOOR_TOP + 0.02, 12.5), Vector3(0.05, 0.04, 23.5), Color("#526b5b"), "temple_walkway")
	_add_box(parent, Vector3(11.0, FLOOR_TOP + 0.035, 12.5), Vector3(20.5, 0.035, 0.05), Color("#ad884e"), "temple_brass_axis")
	for tree_position in [Vector2(11.0, 5.0), Vector2(11.0, 21.5)]:
		_add_box(parent, Vector3(tree_position.x, FLOOR_TOP + 0.03, tree_position.y), Vector3(5.0, 0.045, 3.0), Color("#c0b18d"), "quiet_garden_pad")


func _add_lobby(parent: Node3D, rect: Rect2, scale_factor: float, origin: Vector2) -> void:
	var center := Vector3(rect.position.x + rect.size.x * 0.5, FLOOR_TOP + 0.015, rect.position.y + rect.size.y * 0.52)
	_add_box(parent, center, Vector3(rect.size.x * 0.58, 0.045, rect.size.y * 0.60), Color(PALETTE["rug"]), "lobby_rug")
	_place_prop(parent, "desk", Vector3(center.x, FLOOR_TOP, center.z - 0.15), 1.05, true)
	var base_layout: Dictionary = plan.get("baseLayout", {})
	var lobby_data: Dictionary = base_layout.get("elevatorLobby", {})
	var lobby_bounds: Array = lobby_data.get("bounds", [])
	var hallways: Array = base_layout.get("hallways", [])
	if lobby_bounds.size() >= 4 and not hallways.is_empty():
		var main_hall: Array = hallways[0]
		var hall_center_x := int(main_hall[0]) + int(main_hall[2]) / 2
		var opening_center_x := int(lobby_bounds[0]) + int(plan.get("lobbyHallwayOpening", 0))
		var elevator_center_x := (float(opening_center_x) - origin.x) * scale_factor
		var elevator_y := (float(int(lobby_bounds[1]) + int(lobby_bounds[3]) - 800) - origin.y) * scale_factor
		for point in base_layout.get("passengerElevators", {}).get("positions", []):
			var x := elevator_center_x + float(int(point[0]) - hall_center_x) * scale_factor
			_add_elevator(parent, Vector2(x, elevator_y), scale_factor, false)
		var service_position: Array = base_layout.get("serviceElevator", {}).get("position", [])
		if service_position.size() >= 2:
			var service_x := elevator_center_x + float(int(service_position[0]) - hall_center_x) * scale_factor
			_add_elevator(parent, Vector2(service_x, elevator_y), scale_factor, true)
	_place_prop(parent, "atm", Vector3(rect.position.x + 2.2, FLOOR_TOP, rect.position.y + rect.size.y - 1.1), 0.8)
	_place_prop(parent, "vending_machine", Vector3(rect.position.x + rect.size.x - 2.1, FLOOR_TOP, rect.position.y + rect.size.y - 1.1), 0.8)
	_place_prop(parent, "pay_phone", Vector3(rect.position.x + 3.8, FLOOR_TOP, rect.position.y + rect.size.y - 1.1), 0.8)
	_place_prop(parent, "trash_can", Vector3(rect.position.x + rect.size.x - 4.0, FLOOR_TOP, rect.position.y + rect.size.y - 1.1), 0.8)
	for stair_x in [rect.position.x + 1.0, rect.position.x + rect.size.x - 1.0]:
		_add_box(parent, Vector3(stair_x, 0.42, center.z), Vector3(1.05, 0.72, 1.6), Color(PALETTE["wall"]), "lobby_stair")
		_add_box(parent, Vector3(stair_x, 0.83, center.z), Vector3(1.15, 0.06, 1.7), Color(PALETTE["brass"]), "lobby_stair_rail")
	_add_nameplate(parent, "RECEPTION", Vector3(center.x, 2.25, center.z - 1.55), rect.size.x * 0.35)


func _add_b1(parent: Node3D, floor_data: Dictionary, scale_factor: float) -> void:
	var b1: Dictionary = plan["businessSuiteLayout"]["b1"]
	var yard: Array = b1["exteriorLoadingYardHalf"]
	var yard_rect := Rect2(float(yard[0]) * scale_factor, float(yard[1]) * scale_factor, float(yard[2]) * scale_factor, float(yard[3]) * scale_factor)
	_add_box(parent, Vector3(yard_rect.position.x + yard_rect.size.x * 0.5, FLOOR_TOP + 0.025, yard_rect.position.y + yard_rect.size.y * 0.5), Vector3(yard_rect.size.x, 0.05, yard_rect.size.y), Color("#74786a"), "loading_yard")
	_add_nameplate(parent, "LOADING / WASTE YARD", Vector3(yard_rect.position.x + yard_rect.size.x * 0.5, 2.0, yard_rect.position.y + yard_rect.size.y * 0.35), yard_rect.size.x * 0.65)
	var units: Array = b1.get("businessUnits", [])
	var businesses: Array = floor_data.get("businesses", [])
	for index in range(mini(units.size(), businesses.size())):
		var unit: Dictionary = units[index]
		var business: Dictionary = businesses[index]
		var bounds: Array = unit.get("bounds", [])
		_draw_suite(parent, bounds, str(unit.get("doorSide", "south")), scale_factor, str(business.get("label", "")), false)
	for prop_value in b1.get("yardProps", []):
		var prop_data: Dictionary = prop_value
		var position: Array = prop_data.get("position", [0, 0])
		var x := float(position[0]) * scale_factor
		var z := float(position[1]) * scale_factor
		var kind := str(prop_data.get("kind", ""))
		if kind == "trash_can":
			_place_prop(parent, "trash_can", Vector3(x, FLOOR_TOP, z), 0.68)
		elif kind == "pallet" or kind == "supply_crate":
			_add_crate(parent, Vector3(x, FLOOR_TOP + 0.24, z), kind == "pallet")
		elif kind == "delivery_truck":
			_add_truck(parent, Vector3(x, FLOOR_TOP, z))
		elif kind == "forklift":
			_add_forklift(parent, Vector3(x, FLOOR_TOP, z))


func _add_other_basement(parent: Node3D, basement_number: int, scale_factor: float) -> void:
	var extent := 20.0
	match basement_number:
		2:
			_add_cells(parent, 1.2, 2.2)
			_add_workstation_row(parent, 8.0, 4, "#78523b")
			_add_security_office(parent, 15.3, 4.0)
			_add_nameplate(parent, "COLLECTIONS", Vector3(10.1, 2.05, 9.2), 6.5)
		3:
			_add_workstation_row(parent, 3.0, 3, "#8b5d49")
			_add_fire_bay(parent, 14.4, 4.2)
			_add_incinerator(parent, 17.5, 14.0)
			_add_nameplate(parent, "DISASTER RESPONSE", Vector3(10.0, 2.15, 10.4), 8.0)
		4:
			for row in range(3):
				for column in range(4):
					_add_crate(parent, Vector3(3.0 + column * 3.2, FLOOR_TOP, 4.0 + row * 5.0), false)
			_add_nameplate(parent, "VITAL SUPPLIES", Vector3(10.0, 2.1, 10.2), 7.0)
		5:
			_add_generator(parent, Vector3(5.3, FLOOR_TOP, 5.3))
			_add_generator(parent, Vector3(13.2, FLOOR_TOP, 5.3))
			_add_pipe_run(parent, 3.0, 17.0, 17.0, Color(PALETTE["power"]))
			_add_nameplate(parent, "POWER STATION", Vector3(10.0, 2.1, 13.8), 7.0)
		6:
			_add_water_tank(parent, Vector3(5.0, FLOOR_TOP, 5.2))
			_add_water_tank(parent, Vector3(14.2, FLOOR_TOP, 5.2))
			_add_pipe_run(parent, 3.0, 17.0, 15.0, Color(PALETTE["water"]))
			_add_pump(parent, Vector3(10.0, FLOOR_TOP, 12.4))
			_add_nameplate(parent, "WATER / PLUMBING", Vector3(10.0, 2.1, 17.1), 7.0)
	_add_box(parent, Vector3(extent * 0.5, FLOOR_TOP + 0.01, extent * 0.52), Vector3(1.05, 0.035, 18.0), Color("#344b4b"), "service_aisle")


func _add_cells(parent: Node3D, start_x: float, start_z: float) -> void:
	for index in range(3):
		var x := start_x + float(index) * 2.45
		_add_box(parent, Vector3(x, 0.55, start_z), Vector3(2.15, 0.8, 2.2), Color("#394944"), "cell")
		_wall_h(parent, x - 1.08, x + 1.08, start_z - 1.1, Color(PALETTE["wall"]), 1.8, "cell_back")
		_wall_v(parent, x - 1.08, start_z - 1.1, start_z + 1.1, Color(PALETTE["wall"]), 1.8, "cell_side")
		_wall_v(parent, x + 1.08, start_z - 1.1, start_z + 1.1, Color(PALETTE["wall"]), 1.8, "cell_side")
		for bar_index in range(5):
			_add_box(parent, Vector3(x - 0.85 + bar_index * 0.42, 0.92, start_z + 1.08), Vector3(0.055, 1.45, 0.055), Color(PALETTE["metal"]), "cell_bar")
		_add_box(parent, Vector3(x, 1.68, start_z + 1.08), Vector3(2.12, 0.07, 0.07), Color(PALETTE["metal"]), "cell_bar_top")


func _add_security_office(parent: Node3D, x: float, z: float) -> void:
	_add_box(parent, Vector3(x, 1.12, z), Vector3(4.2, 2.25, 4.4), Color(PALETTE["wall_dark"]), "security_room")
	_add_box(parent, Vector3(x, 0.15, z), Vector3(4.0, 0.08, 4.2), Color("#70685b"), "security_floor")
	_place_prop(parent, "desk", Vector3(x, FLOOR_TOP, z + 0.45), 0.65)
	_add_box(parent, Vector3(x + 1.4, 0.72, z - 0.55), Vector3(0.6, 1.3, 0.32), Color(PALETTE["metal"]), "armory_cabinet")


func _add_workstation_row(parent: Node3D, z: float, count: int, color: String) -> void:
	for index in range(count):
		var x := 3.0 + float(index) * 3.0
		_place_prop(parent, "desk", Vector3(x, FLOOR_TOP, z), 0.63)
		_place_prop(parent, "chair", Vector3(x, FLOOR_TOP, z + 1.0), 0.62)
		_place_prop(parent, "telephone", Vector3(x - 0.7, FLOOR_TOP, z), 0.55)


func _add_fire_bay(parent: Node3D, x: float, z: float) -> void:
	_add_box(parent, Vector3(x, FLOOR_TOP + 0.65, z), Vector3(4.4, 1.25, 2.2), Color("#9b5544"), "fire_engine_body")
	_add_box(parent, Vector3(x + 0.45, 1.66, z), Vector3(1.6, 0.72, 1.95), Color("#dfd1af"), "fire_engine_cab")
	for wheel_x in [x - 1.25, x + 1.25]:
		for wheel_z in [z - 0.86, z + 0.86]:
			_add_cylinder(parent, Vector3(wheel_x, FLOOR_TOP + 0.28, wheel_z), 0.31, 0.2, Color(PALETTE["dark"]), "fire_engine_wheel")
	_add_box(parent, Vector3(x - 0.7, 1.45, z), Vector3(1.2, 0.12, 0.12), Color(PALETTE["brass"]), "fire_ladder")


func _add_incinerator(parent: Node3D, x: float, z: float) -> void:
	_add_box(parent, Vector3(x, 0.9, z), Vector3(2.2, 1.6, 2.2), Color("#51564e"), "incinerator")
	_add_box(parent, Vector3(x, 0.42, z + 1.14), Vector3(1.1, 0.72, 0.08), Color(PALETTE["alert"]), "incinerator_door")
	_add_cylinder(parent, Vector3(x + 0.62, 2.05, z - 0.55), 0.28, 1.0, Color(PALETTE["metal"]), "incinerator_stack")


func _add_generator(parent: Node3D, at: Vector3) -> void:
	_add_box(parent, at + Vector3(0, 0.76, 0), Vector3(3.4, 1.45, 2.25), Color("#3f5149"), "generator_body")
	_add_box(parent, at + Vector3(0, 1.53, 0), Vector3(3.0, 0.12, 2.0), Color(PALETTE["brass"]), "generator_top")
	for index in range(5):
		_add_box(parent, at + Vector3(-1.05 + index * 0.52, 0.75, 1.15), Vector3(0.22, 0.9, 0.06), Color(PALETTE["dark"]), "generator_vent")
	_add_cylinder(parent, at + Vector3(1.4, 1.15, -0.55), 0.24, 1.2, Color(PALETTE["metal"]), "generator_exhaust")


func _add_water_tank(parent: Node3D, at: Vector3) -> void:
	_add_cylinder(parent, at + Vector3(0, 1.35, 0), 1.45, 2.6, Color("#587e80"), "water_tank")
	_add_cylinder(parent, at + Vector3(0, 2.67, 0), 1.48, 0.12, Color(PALETTE["brass"]), "tank_rim")
	_add_cylinder(parent, at + Vector3(0, 0.06, 0), 1.52, 0.12, Color(PALETTE["dark"]), "tank_base")


func _add_pump(parent: Node3D, at: Vector3) -> void:
	_add_box(parent, at + Vector3(0, 0.4, 0), Vector3(2.1, 0.8, 1.55), Color("#3d5d5f"), "pump_body")
	_add_cylinder(parent, at + Vector3(-0.55, 1.04, 0), 0.48, 0.45, Color(PALETTE["brass"]), "pump_motor")
	_add_box(parent, at + Vector3(0.52, 1.18, 0), Vector3(0.13, 0.09, 0.13), Color(PALETTE["cream"]), "pump_gauge")


func _add_pipe_run(parent: Node3D, x0: float, x1: float, z: float, color: Color) -> void:
	_add_box(parent, Vector3((x0 + x1) * 0.5, 2.08, z), Vector3(x1 - x0, 0.11, 0.11), color, "ceiling_pipe")
	for x in [x0 + 1.2, x1 - 1.2]:
		_add_box(parent, Vector3(x, 1.65, z), Vector3(0.08, 0.85, 0.08), color, "pipe_drop")


func _add_crate(parent: Node3D, at: Vector3, pallet: bool) -> void:
	if pallet:
		_add_box(parent, at + Vector3(0, 0.10, 0), Vector3(1.35, 0.18, 0.95), Color(PALETTE["wood"]), "pallet")
		for slat in range(4):
			_add_box(parent, at + Vector3(0, 0.22, -0.36 + slat * 0.24), Vector3(1.1, 0.045, 0.055), Color(PALETTE["brass"]), "pallet_slat")
	else:
		_add_box(parent, at + Vector3(0, 0.48, 0), Vector3(0.92, 0.92, 0.82), Color("#8a765b"), "supply_crate")
		for z_offset in [-0.42, 0.42]:
			_add_box(parent, at + Vector3(0, 0.48, z_offset), Vector3(0.94, 0.055, 0.055), Color(PALETTE["brass"]), "crate_strap")
		_add_box(parent, at + Vector3(0, 0.48, -0.43), Vector3(0.055, 0.84, 0.04), Color(PALETTE["brass"]), "crate_strap")


func _add_truck(parent: Node3D, at: Vector3) -> void:
	_add_box(parent, at + Vector3(0, 0.66, 0), Vector3(3.5, 1.1, 1.55), Color("#718678"), "delivery_truck_box")
	_add_box(parent, at + Vector3(1.25, 1.18, 0), Vector3(1.05, 0.88, 1.48), Color("#dfd1af"), "delivery_truck_cab")
	for wheel_x in [-1.1, 1.1]:
		for wheel_z in [-0.62, 0.62]:
			_add_cylinder(parent, at + Vector3(wheel_x, 0.28, wheel_z), 0.28, 0.18, Color(PALETTE["dark"]), "truck_wheel")


func _add_forklift(parent: Node3D, at: Vector3) -> void:
	_add_box(parent, at + Vector3(0, 0.48, 0), Vector3(1.5, 0.72, 1.05), Color("#ad884e"), "forklift_body")
	_add_box(parent, at + Vector3(0.48, 1.12, -0.12), Vector3(0.08, 1.1, 0.08), Color(PALETTE["dark"]), "forklift_frame")
	_add_box(parent, at + Vector3(0.95, 0.34, 0), Vector3(0.9, 0.07, 0.10), Color(PALETTE["metal"]), "forklift_fork")
	for wheel_x in [-0.48, 0.48]:
		for wheel_z in [-0.46, 0.46]:
			_add_cylinder(parent, at + Vector3(wheel_x, 0.22, wheel_z), 0.20, 0.15, Color(PALETTE["dark"]), "forklift_wheel")


func _add_hall_fixtures(parent: Node3D, floor_number: int, basement_number: int, scale_factor: float, origin: Vector2) -> void:
	var kinds := ["atm", "vending_machine", "pay_phone", "trash_can", "fire_extinguisher"]
	var positions: Array = []
	if basement_number > 0:
		var basement_positions := {
			1: [[6800, 5000], [7600, 5000], [8400, 5000], [9200, 5000], [9600, 5250]],
			2: [[8600, 4000], [8600, 5000], [8600, 6000], [8600, 7000], [8600, 8000]],
			3: [[8500, 2000], [8500, 3000], [8500, 4000], [8500, 5000], [8500, 6000]],
			4: [[1500, 4500], [2500, 4500], [3500, 4500], [4500, 4500], [5500, 5500]],
			5: [[2500, 6500], [3500, 6500], [4500, 6500], [5500, 6500], [6500, 6500]],
			6: [[3500, 7500], [4500, 7500], [5500, 7500], [6500, 7500], [7500, 3500]],
		}
		positions = basement_positions[basement_number]
	elif floor_number >= 2:
		positions = [[12790, 5000], [12790, 8000], [9200, 5000], [9200, 8000], [9200, 3500]]
	else:
		return
	for index in range(kinds.size()):
		var point: Array = positions[index]
		var x := (float(point[0]) - origin.x) * scale_factor
		var z := (float(point[1]) - origin.y) * scale_factor
		var prop_scale := 0.48 if basement_number > 0 else 0.78
		_place_prop(parent, kinds[index], Vector3(x, FLOOR_TOP, z), prop_scale)


func _add_interior_props(parent: Node3D, props: Array, scale_factor: float) -> void:
	for prop_value in props:
		var prop_data: Dictionary = prop_value
		var point: Array = prop_data.get("position", [0, 0])
		var x := float(point[0]) * scale_factor
		var z := float(point[1]) * scale_factor
		var kind := str(prop_data.get("kind", ""))
		var prop_scale := 0.8
		if kind == "temple_tree":
			prop_scale = 0.82
		elif kind == "reflection_screen":
			prop_scale = 0.76
		_place_prop(parent, kind, Vector3(x, FLOOR_TOP, z), prop_scale)


func _place_prop(parent: Node3D, kind: String, at: Vector3, prop_scale: float = 1.0, reception: bool = false) -> Node3D:
	var prop: Node3D
	if kind in Service.SERVICE_KINDS:
		prop = Service.create_service(kind)
	else:
		prop = Prop.create(kind, reception)
	prop.position = at
	prop.scale = Vector3.ONE * prop_scale
	parent.add_child(prop)
	return prop


func _add_nameplate(parent: Node3D, text: String, at: Vector3, width: float) -> void:
	var plate_width := clampf(width * 0.76, 1.3, 4.2)
	_add_box(parent, at + Vector3(0, -0.14, 0), Vector3(plate_width, 0.32, 0.11), Color(PALETTE["wall_dark"]), "business_nameplate")
	_add_box(parent, at + Vector3(0, -0.14, 0.065), Vector3(plate_width - 0.10, 0.035, 0.018), Color(PALETTE["brass"]), "nameplate_trim")
	var label := Label3D.new()
	label.text = text.to_upper()
	label.font_size = 26
	label.pixel_size = 0.0065
	label.modulate = Color("#f0e3c7")
	label.outline_size = 4
	label.outline_modulate = Color("#1a2623")
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.position = at + Vector3(0, -0.14, 0.13)
	label.rotation.y = PI
	parent.add_child(label)


func _add_floor_marker(parent: Node3D, text: String, at: Vector2) -> void:
	var base := Vector3(at.x, FLOOR_TOP + 0.04, at.y)
	_add_box(parent, base, Vector3(1.6, 0.08, 0.62), Color(PALETTE["wall_dark"]), "floor_marker")
	_add_box(parent, base + Vector3(0, 0.045, 0.0), Vector3(1.48, 0.025, 0.035), Color(PALETTE["brass"]), "floor_marker_trim")


func _add_box(parent: Node3D, at: Vector3, size: Vector3, color: Color, key: String = "custom") -> MeshInstance3D:
	var mesh := BoxMesh.new()
	mesh.size = size
	mesh.material = _material_for(color, key)
	var instance := MeshInstance3D.new()
	instance.mesh = mesh
	instance.position = at
	instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	parent.add_child(instance)
	return instance


func _box(parent: Node3D, at: Vector3, size: Vector3, color: Color, key: String = "custom") -> void:
	_add_box(parent, at, size, color, key)


func _add_cylinder(parent: Node3D, at: Vector3, radius: float, height: float, color: Color, key: String) -> void:
	var mesh := CylinderMesh.new()
	mesh.top_radius = radius
	mesh.bottom_radius = radius
	mesh.height = height
	mesh.radial_segments = 16
	mesh.material = _material_for(color, key)
	var instance := MeshInstance3D.new()
	instance.mesh = mesh
	instance.position = at
	parent.add_child(instance)


func _wall_h(parent: Node3D, x0: float, x1: float, z: float, color: Color, height: float, key: String) -> void:
	if x1 <= x0:
		return
	_add_box(parent, Vector3((x0 + x1) * 0.5, height * 0.5, z), Vector3(x1 - x0, height, WALL_THICKNESS), color, key)
	_add_box(parent, Vector3((x0 + x1) * 0.5, height + 0.015, z), Vector3(x1 - x0, 0.035, WALL_THICKNESS * 1.3), Color(PALETTE["brass"]), key + "_cap")


func _wall_v(parent: Node3D, x: float, z0: float, z1: float, color: Color, height: float, key: String) -> void:
	if z1 <= z0:
		return
	_add_box(parent, Vector3(x, height * 0.5, (z0 + z1) * 0.5), Vector3(WALL_THICKNESS, height, z1 - z0), color, key)
	_add_box(parent, Vector3(x, height + 0.015, (z0 + z1) * 0.5), Vector3(WALL_THICKNESS * 1.3, 0.035, z1 - z0), Color(PALETTE["brass"]), key + "_cap")


func _wall_h_with_gap(parent: Node3D, x0: float, x1: float, z: float, color: Color, height: float, center: float, gap: float, key: String) -> void:
	var gap_left := center - gap * 0.5
	var gap_right := center + gap * 0.5
	_wall_h(parent, x0, minf(x1, gap_left), z, color, height, key + "_left")
	_wall_h(parent, maxf(x0, gap_right), x1, z, color, height, key + "_right")


func _floor_color(material_name: String) -> Color:
	var palette_key := material_name
	match material_name:
		"lobby_floor": palette_key = "lobby"
		"hall_floor": palette_key = "hall"
		"temple_floor": palette_key = "temple"
		"construction_floor": palette_key = "construction"
	return Color(PALETTE.get(palette_key, PALETTE["hall"]))


func _material_for(color: Color, key: String) -> StandardMaterial3D:
	var cache_key := "%s:%s" % [key, color.to_html()]
	if materials.has(cache_key):
		return materials[cache_key]
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = 0.82
	if key.contains("brass"):
		material.metallic = 0.42
		material.roughness = 0.4
	materials[cache_key] = material
	return material


func _update_camera(job: Dictionary) -> void:
	var floor_number: int = int(job["floor"])
	var basement_number: int = int(job["basement"])
	var room_id := "basement_b%d" % basement_number if basement_number > 0 else str(plan["playableFloors"][str(floor_number)]["room"])
	var room := _find_room(room_id)
	var bounds: Array = room.get("bounds", [0, 0, 22000, 25000])
	var scale_factor := STANDARD_SCALE
	if basement_number > 1:
		scale_factor = BASEMENT_SCALE
	elif floor_number == 1:
		scale_factor = LOBBY_SCALE
	var origin := Vector2.ZERO
	if floor_number == 1:
		var base_layout: Dictionary = plan.get("baseLayout", {})
		var lobby: Dictionary = base_layout.get("elevatorLobby", {})
		bounds = lobby.get("bounds", bounds)
		var hallways: Array = base_layout.get("hallways", [])
		if bounds.size() >= 4 and not hallways.is_empty():
			var main_hall: Array = hallways[0]
			origin = Vector2(
				float(int(bounds[0]) + int(plan.get("lobbyHallwayOpening", 0)) - int(main_hall[0]) - int(main_hall[2]) / 2),
				float(int(bounds[1]) + int(bounds[3])),
			)
	var width := float(bounds[2]) * scale_factor
	var depth := float(bounds[3]) * scale_factor
	var x0 := (float(bounds[0]) - origin.x) * scale_factor
	var z0 := (float(bounds[1]) - origin.y) * scale_factor
	var center := Vector3(x0 + width * 0.5, 0.0, z0 + depth * 0.5)
	var dimension := maxf(width, depth)
	camera.size = maxf(dimension * 1.48, 12.0)
	camera.far = maxf(dimension * 4.0, 250.0)
	camera.position = center + Vector3(dimension * 0.70, dimension * 1.25, dimension * 0.95)
	camera.look_at(center + Vector3(0.0, 0.3, 0.0), Vector3.UP)


func _subtitle_for(job: Dictionary) -> String:
	if int(job["basement"]) > 0:
		var basement_number: int = int(job["basement"])
		var basement_labels := {
			1: "OPERATIONS + LOADING YARD",
			2: "COLLECTIONS · SECURITY · CELLS",
			3: "DISASTER RESPONSE · FIRE · MAINTENANCE",
			4: "VITAL SUPPLIES STORAGE",
			5: "POWER STATION · BACKUP GENERATORS",
			6: "WATER PUMPING · PLUMBING",
		}
		return str(basement_labels[basement_number])
	var floor_number: int = int(job["floor"])
	var floor_data: Dictionary = plan["playableFloors"][str(floor_number)]
	return str(floor_data.get("label", "FLOOR %02d" % floor_number))
