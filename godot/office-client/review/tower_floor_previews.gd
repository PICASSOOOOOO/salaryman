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
var annotation_layer: Control
var pending_annotations: Array[Dictionary] = []
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
	if DisplayServer.get_name() == "headless":
		push_error("Tower review renders require an X11/GL display; the headless dummy renderer has no viewport texture.")
		quit(1)
		return
	var requested_ids: Array[String] = []
	if args.size() > 1:
		for requested_id in args[1].split(","):
			var normalized_id := requested_id.strip_edges().to_upper()
			if not normalized_id.is_empty():
				requested_ids.append(normalized_id)
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
		var basement_job: Dictionary = {"id": "B%d" % basement, "floor": 0, "basement": basement}
		if basement == 2 or basement == 3:
			basement_job["cameraFocus"] = "basement-department"
		jobs.append(basement_job)
		if basement == 2 or basement == 3:
			jobs.append({
				"id": "B%d-OVERVIEW" % basement,
				"floor": 0,
				"basement": basement,
				"title": "SALARYMAN OS  /  TOWER B%d OVERVIEW" % basement,
				"subtitle": "FULL 282.84 M × 282.84 M FLOOR FOOTPRINT",
			})
	for floor_number in range(1, 13):
		jobs.append({"id": "F%d" % floor_number, "floor": floor_number, "basement": 0})
	jobs.append({
		"id": "B1-YARD",
		"floor": 0,
		"basement": 1,
		"cameraFocus": "b1-yard",
		"title": "SALARYMAN OS  /  B1 LOADING YARD",
		"subtitle": "TRUCK · FORKLIFT · PALLETS · SUPPLIES · GARBAGE CANS",
	})
	jobs.append({
		"id": "B1-GATE",
		"floor": 0,
		"basement": 1,
		"cameraFocus": "b1-gate",
		"title": "SALARYMAN OS  /  B1 OPEN-AIR YARD",
		"subtitle": "FENCED EXTERIOR GATE  ·  NO ROOF",
	})
	jobs.append({
		"id": "F2-WINDOW",
		"floor": 2,
		"basement": 0,
		"cameraFocus": "f2-window",
		"title": "SALARYMAN OS  /  F2 EXTERIOR WALL",
		"subtitle": "VISIBLE GLAZING  ·  30 CM WALL",
	})

	for job in jobs:
		var floor_id := str(job["id"])
		if not requested_ids.is_empty() and not requested_ids.has(floor_id):
			continue
		print("Preparing native Tower preview: ", floor_id)
		active_floor = Node3D.new()
		active_floor.name = "Preview_%s" % job["id"]
		scene_world.add_child(active_floor)
		pending_annotations.clear()
		_render_floor(active_floor, job)
		print("Scene ready for native Tower preview: ", floor_id)
		_update_camera(job)
		title_label.text = str(job.get("title", "SALARYMAN OS  /  TOWER %s" % job["id"]))
		subtitle_label.text = str(job.get("subtitle", _subtitle_for(job)))
		for frame in range(4):
			print("Waiting for Tower render frame ", frame + 1, ": ", floor_id)
			await process_frame
			if frame == 0:
				_draw_review_annotations()
			print("Tower render frame ready: ", floor_id, " / ", frame + 1)
		print("Capturing Tower viewport: ", floor_id, " / display=", DisplayServer.get_name())
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
	sunlight.shadow_enabled = false
	scene_world.add_child(sunlight)
	root.size = Vector2i(1280, 720)

	camera = Camera3D.new()
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.near = 0.05
	camera.far = 250.0
	scene_world.add_child(camera)
	camera.current = true

	var overlay := CanvasLayer.new()
	root.add_child(overlay)
	annotation_layer = Control.new()
	annotation_layer.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	annotation_layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	overlay.add_child(annotation_layer)
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
	footer.position = Vector2(42, 676)
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
	if is_basement and basement_number > 1:
		floor_data = room_spec
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
	elif is_basement:
		_add_basement_shell(parent, floor_rect)
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
		_add_b1(parent, floor_data, scale_factor, str(job.get("cameraFocus", "")) == "b1-yard")
	elif is_basement:
		_add_other_basement(parent, basement_number, scale_factor, room_spec)

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


func _add_basement_shell(parent: Node3D, rect: Rect2) -> void:
	var left := rect.position.x
	var right := rect.position.x + rect.size.x
	var back := rect.position.y
	var front := rect.position.y + rect.size.y
	_wall_h(parent, left, right, back, Color(PALETTE["wall_dark"]), WALL_HEIGHT, "basement_rear_wall")
	_wall_v(parent, left, back, front, Color(PALETTE["wall_dark"]), WALL_HEIGHT, "basement_left_wall")
	_wall_v(parent, right, back, front, Color(PALETTE["wall_dark"]), WALL_HEIGHT, "basement_right_wall")
	# Keep the near wall low so underground rooms and maze paths remain visible.
	_wall_h(parent, left, right, front, Color(PALETTE["wall_dark"]), 0.52, "basement_cutaway_wall")


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
		_queue_annotation(
			str(business.get("label", "BUSINESS")),
			Vector3(
				(float(bounds[0]) + float(bounds[2]) * 0.5) * scale_factor,
				2.55,
				(float(bounds[1]) + float(bounds[3]) * 0.5) * scale_factor,
			),
		)


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
			_queue_annotation(str(business.get("label", "BUSINESS")), Vector3(center_x, 2.55, patch.position.y + patch.size.y * 0.5))

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
	var room_spec := _find_room(str(floor_data.get("room", "floor07_business")))
	var bounds: Array = room_spec.get("bounds", [0, 0, 62225, 70711])
	var width := float(bounds[2]) * scale_factor
	var depth := float(bounds[3]) * scale_factor
	var center_x := width * 0.5
	var center_z := depth * 0.5
	_add_box(parent, Vector3(center_x, FLOOR_TOP + 0.02, center_z), Vector3(1.8, 0.04, depth - 12.0), Color("#526b5b"), "temple_north_south_walkway")
	_add_box(parent, Vector3(center_x, FLOOR_TOP + 0.035, center_z), Vector3(width - 12.0, 0.035, 1.8), Color("#ad884e"), "temple_east_west_axis")
	for prop_value in floor_data.get("interiorProps", []):
		var prop_data: Dictionary = prop_value
		if str(prop_data.get("kind", "")) != "temple_tree":
			continue
		var point: Array = prop_data.get("position", [0, 0])
		var garden_center := Vector3(float(point[0]) * scale_factor, FLOOR_TOP + 0.03, float(point[1]) * scale_factor)
		_add_box(parent, garden_center, Vector3(6.0, 0.045, 6.0), Color("#c0b18d"), "quiet_garden_pad")
	_queue_annotation("MEDITATION TEMPLE", Vector3(center_x, 2.55, center_z))
	_queue_annotation("REFLECTION ALCOVES", Vector3(center_x, 2.55, depth * 0.69))
	_queue_annotation("QUIET GARDENS", Vector3(center_x, 2.55, depth * 0.30))


func _add_lobby(parent: Node3D, rect: Rect2, scale_factor: float, origin: Vector2) -> void:
	var center := Vector3(rect.position.x + rect.size.x * 0.5, FLOOR_TOP + 0.015, rect.position.y + rect.size.y * 0.52)
	_add_box(parent, center, Vector3(rect.size.x * 0.58, 0.045, rect.size.y * 0.60), Color(PALETTE["rug"]), "lobby_rug")
	_place_prop(parent, "desk", Vector3(center.x, FLOOR_TOP, center.z - 0.15), 1.05, true)
	_queue_annotation("RECEPTION", center + Vector3(0, 2.55, -1.0))
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
	for kiosk_value in plan.get("businessSuiteLayout", {}).get("lobbyKiosks", []):
		var kiosk: Dictionary = kiosk_value
		var point: Array = kiosk.get("position", [0, 0])
		var kiosk_at := Vector3(
			(float(point[0]) - origin.x) * scale_factor,
			FLOOR_TOP,
			(float(point[1]) - origin.y) * scale_factor,
		)
		_add_box(parent, kiosk_at + Vector3(0, 0.08, 0), Vector3(1.6, 0.16, 1.1), Color(PALETTE["brass"]), "lobby_kiosk_podium")
		_place_prop(parent, "desk", kiosk_at, 0.72)
		_queue_annotation(str(kiosk.get("label", "LOBBY KIOSK")), kiosk_at + Vector3(0, 2.55, 0))
	for stair_x in [rect.position.x + 1.0, rect.position.x + rect.size.x - 1.0]:
		_add_box(parent, Vector3(stair_x, 0.42, center.z), Vector3(1.05, 0.72, 1.6), Color(PALETTE["wall"]), "lobby_stair")
		_add_box(parent, Vector3(stair_x, 0.83, center.z), Vector3(1.15, 0.06, 1.7), Color(PALETTE["brass"]), "lobby_stair_rail")
	_add_nameplate(parent, "RECEPTION", Vector3(center.x, 2.25, center.z - 1.55), rect.size.x * 0.35)


func _add_b1(parent: Node3D, floor_data: Dictionary, scale_factor: float, show_yard_annotations: bool = false) -> void:
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
		if not show_yard_annotations:
			_queue_annotation(
				str(business.get("label", "BUSINESS")),
				Vector3(
					(float(bounds[0]) + float(bounds[2]) * 0.5) * scale_factor,
					2.55,
					(float(bounds[1]) + float(bounds[3]) * 0.5) * scale_factor,
				),
			)
	for prop_value in b1.get("yardProps", []):
		var prop_data: Dictionary = prop_value
		var position: Array = prop_data.get("position", [0, 0])
		var x := float(position[0]) * scale_factor
		var z := float(position[1]) * scale_factor
		if show_yard_annotations:
			_queue_annotation(str(prop_data.get("label", "YARD PROP")), Vector3(x, 2.55, z))
		var kind := str(prop_data.get("kind", ""))
		if kind == "trash_can":
			_place_prop(parent, "trash_can", Vector3(x, FLOOR_TOP, z), 0.68)
		elif kind == "pallet" or kind == "supply_crate":
			_add_crate(parent, Vector3(x, FLOOR_TOP + 0.24, z), kind == "pallet")
		elif kind == "delivery_truck":
			_add_truck(parent, Vector3(x, FLOOR_TOP, z))
		elif kind == "forklift":
			_add_forklift(parent, Vector3(x, FLOOR_TOP, z))


func _add_other_basement(parent: Node3D, basement_number: int, scale_factor: float, room_spec: Dictionary) -> void:
	if basement_number >= 4:
		_add_basement_maze(parent, room_spec, scale_factor)
	match basement_number:
		2:
			# These points match the live Pygame basement object layout.
			for index in range(6):
				var point_x := 1700.0 + float(index % 3) * 1750.0
				var point_z := 1800.0 + float(index / 3) * 1900.0
				var desk_at := Vector3(point_x * scale_factor, FLOOR_TOP, point_z * scale_factor)
				_place_prop(parent, "desk", desk_at, 0.76)
				_place_prop(parent, "chair", desk_at + Vector3(0.52, 0.0, 0.82), 0.70)
			_add_cells(parent, 7300.0, 2200.0, scale_factor)
			_add_security_office(parent, 7200.0 * scale_factor, 5000.0 * scale_factor)
			_place_prop(parent, "desk", Vector3(7200.0 * scale_factor, FLOOR_TOP, 7100.0 * scale_factor), 0.76)
			_add_nameplate(parent, "COLLECTIONS FACILITY", Vector3(3500.0 * scale_factor, 2.05, 4300.0 * scale_factor), 9.0)
			_add_nameplate(parent, "CORPORATE SECURITY", Vector3(7200.0 * scale_factor, 2.05, 5000.0 * scale_factor), 7.0)
			_add_nameplate(parent, "INVESTIGATIONS", Vector3(7200.0 * scale_factor, 2.05, 7100.0 * scale_factor), 6.0)
			_queue_annotation("COLLECTIONS", Vector3(3500.0 * scale_factor, 2.55, 2500.0 * scale_factor))
			_queue_annotation("CORPORATE DETENTION", Vector3(7300.0 * scale_factor, 2.55, 2200.0 * scale_factor))
			_queue_annotation("CORPORATE SECURITY", Vector3(7200.0 * scale_factor, 2.55, 5000.0 * scale_factor))
			_queue_annotation("INVESTIGATIONS", Vector3(7200.0 * scale_factor, 2.55, 7100.0 * scale_factor))
		3:
			_add_workstation_row(parent, 2000.0, 1, "#8b5d49", scale_factor, 2000.0)
			_add_fire_bay(parent, 2000.0 * scale_factor, 4000.0 * scale_factor)
			_place_prop(parent, "desk", Vector3(2000.0 * scale_factor, FLOOR_TOP, 6000.0 * scale_factor), 0.76)
			_place_prop(parent, "desk", Vector3(5000.0 * scale_factor, FLOOR_TOP, 3200.0 * scale_factor), 0.72)
			_place_prop(parent, "desk", Vector3(4300.0 * scale_factor, FLOOR_TOP, 5000.0 * scale_factor), 0.72)
			_add_incinerator(parent, 5000.0 * scale_factor, 7000.0 * scale_factor)
			_add_nameplate(parent, "DISASTER RESPONSE", Vector3(2000.0 * scale_factor, 2.15, 2000.0 * scale_factor), 6.0)
			_add_nameplate(parent, "FIRE STATION", Vector3(2000.0 * scale_factor, 2.15, 4000.0 * scale_factor), 6.0)
			_add_nameplate(parent, "MAINTENANCE BAY", Vector3(2000.0 * scale_factor, 2.15, 6000.0 * scale_factor), 6.0)
			_add_nameplate(parent, "WORK ORDERS / UNIFORM", Vector3(4600.0 * scale_factor, 2.15, 4200.0 * scale_factor), 8.0)
			_add_nameplate(parent, "INCINERATOR / CLAIMS", Vector3(5000.0 * scale_factor, 2.15, 7000.0 * scale_factor), 7.0)
			_queue_annotation("DISASTER RESPONSE", Vector3(2000.0 * scale_factor, 2.55, 2000.0 * scale_factor))
			_queue_annotation("FIRE STATION", Vector3(2000.0 * scale_factor, 2.55, 4000.0 * scale_factor))
			_queue_annotation("MAINTENANCE BAY", Vector3(2000.0 * scale_factor, 2.55, 6000.0 * scale_factor))
			_queue_annotation("WORK ORDERS / UNIFORM", Vector3(4600.0 * scale_factor, 2.55, 4200.0 * scale_factor))
			_queue_annotation("INCINERATOR / CLAIMS", Vector3(5000.0 * scale_factor, 2.55, 7000.0 * scale_factor))
		4:
			var supply_center := Vector3(5000.0 * scale_factor, FLOOR_TOP, 6500.0 * scale_factor)
			for row in range(2):
				for column in range(3):
					var at := supply_center + Vector3((float(column) - 1.0) * 1.5, 0.0, (float(row) - 0.5) * 1.5)
					_add_crate(parent, at, false)
			_add_nameplate(parent, "VITAL SUPPLIES", supply_center + Vector3(0, 2.1, -2.0), 7.0)
			_queue_annotation("VITAL SUPPLIES", supply_center + Vector3(0, 2.55, 0))
		5:
			var power_source: Array = _basement_utility_position("electrical", [21213, 5657])
			var generator_a := Vector3(float(power_source[0]) * scale_factor, FLOOR_TOP, float(power_source[1]) * scale_factor)
			var generator_b := generator_a + Vector3(4.4, 0.0, 3.5)
			_add_generator(parent, generator_a)
			_add_generator(parent, generator_b)
			_add_pipe_run(parent, generator_a.x - 2.0, generator_b.x + 2.0, generator_a.z + 1.4, Color(PALETTE["power"]))
			_add_nameplate(parent, "POWER STATION / BACKUP GENERATORS", generator_a + Vector3(0, 2.1, 5.0), 10.0)
			_queue_annotation("POWER / BACKUP GENERATORS", generator_a + Vector3(0, 2.55, 0))
		6:
			var water_source: Array = _basement_utility_position("water", [7071, 21213])
			var tank_a := Vector3(float(water_source[0]) * scale_factor, FLOOR_TOP, float(water_source[1]) * scale_factor)
			var tank_b := tank_a + Vector3(3.8, 0.0, -2.8)
			var pump_at := tank_a + Vector3(7.0, 0.0, 0.0)
			_add_water_tank(parent, tank_a)
			_add_water_tank(parent, tank_b)
			_add_pipe_run(parent, tank_a.x - 2.0, pump_at.x + 1.0, tank_a.z + 2.0, Color(PALETTE["water"]))
			_add_pump(parent, pump_at)
			_add_nameplate(parent, "WATER / PLUMBING", pump_at + Vector3(0, 2.1, 2.0), 7.0)
			_queue_annotation("WATER / PLUMBING", pump_at + Vector3(0, 2.55, 0))


func _basement_utility_position(system_id: String, fallback: Array) -> Array:
	for system_value in plan.get("infrastructureMap", {}).get("systems", []):
		var system_data: Dictionary = system_value
		if str(system_data.get("id", "")) == system_id:
			var source: Dictionary = system_data.get("source", {})
			if str(source.get("room", "")) == "basement_b5" and system_id == "electrical":
				return source.get("position", fallback)
			if str(source.get("room", "")) == "basement_b6" and system_id == "water":
				return source.get("position", fallback)
	return fallback


func _add_basement_maze(parent: Node3D, room_spec: Dictionary, scale_factor: float) -> void:
	var cell_size := float(room_spec.get("mazeCellUnits", 0))
	var cells: Array = room_spec.get("mazeCells", [])
	if cell_size <= 0.0 or cells.is_empty():
		push_error("Missing basement maze cells for " + str(room_spec.get("id", "unknown")))
		failed = true
		return

	var walkable: Dictionary = {}
	for cell_value in cells:
		var cell: Array = cell_value
		if cell.size() == 2:
			walkable[Vector2i(int(cell[0]), int(cell[1]))] = true

	var world_cell_size := cell_size * scale_factor
	var wall_color := Color("#43504a")
	var wall_height := 1.65
	for cell_value in cells:
		var cell: Array = cell_value
		if cell.size() != 2:
			continue
		var coordinate := Vector2i(int(cell[0]), int(cell[1]))
		var left := float(coordinate.x) * world_cell_size
		var back := float(coordinate.y) * world_cell_size
		var center := Vector3(left + world_cell_size * 0.5, FLOOR_TOP + 0.015, back + world_cell_size * 0.5)
		var tile_color := Color("#4b6258") if (coordinate.x + coordinate.y) % 2 == 0 else Color("#42584f")
		_add_box(parent, center, Vector3(world_cell_size - 0.12, 0.028, world_cell_size - 0.12), tile_color, "maze_walkable_cell")
		_add_basement_maze_wall(parent, walkable, coordinate, Vector2i(0, -1), left, back, world_cell_size, wall_height, wall_color)
		_add_basement_maze_wall(parent, walkable, coordinate, Vector2i(1, 0), left + world_cell_size, back, world_cell_size, wall_height, wall_color)
		_add_basement_maze_wall(parent, walkable, coordinate, Vector2i(0, 1), left, back + world_cell_size, world_cell_size, wall_height, wall_color)
		_add_basement_maze_wall(parent, walkable, coordinate, Vector2i(-1, 0), left, back, world_cell_size, wall_height, wall_color)


func _add_basement_maze_wall(parent: Node3D, walkable: Dictionary, coordinate: Vector2i, delta: Vector2i, edge_x: float, edge_z: float, length: float, wall_height: float, color: Color) -> void:
	if walkable.has(coordinate + delta):
		return
	var horizontal := delta.y != 0
	var size := Vector3(length, wall_height, WALL_THICKNESS) if horizontal else Vector3(WALL_THICKNESS, wall_height, length)
	_add_box(parent, Vector3(edge_x + (length * 0.5 if horizontal else 0.0), wall_height * 0.5, edge_z + (length * 0.5 if not horizontal else 0.0)), size, color, "tunnel_wall")


func _add_cells(parent: Node3D, start_x_units: float, start_z_units: float, scale_factor: float) -> void:
	for index in range(3):
		var x := start_x_units * scale_factor + float(index) * 2.45
		var start_z := start_z_units * scale_factor
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


func _add_workstation_row(parent: Node3D, z_units: float, count: int, color: String, scale_factor: float = 1.0, start_x_units: float = 300.0) -> void:
	for index in range(count):
		var x := start_x_units * scale_factor + float(index) * 3.0
		var z := z_units * scale_factor
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
		var basement_room := _find_room("basement_b%d" % basement_number)
		positions = basement_room.get("hallwayFixtures", [])
	elif floor_number >= 2:
		var hallways: Array = plan.get("baseLayout", {}).get("hallways", [])
		if not hallways.is_empty():
			var main_hall: Array = hallways[0]
			var hall_center_x := float(main_hall[0]) + float(main_hall[2]) * 0.5
			for index in range(kinds.size()):
				positions.append([hall_center_x, 3000 + index * 3000])
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


func _queue_annotation(text: String, world_position: Vector3) -> void:
	pending_annotations.append({"text": text, "position": world_position})


func _draw_review_annotations() -> void:
	for child in annotation_layer.get_children():
		child.queue_free()
	var occupied: Array[Rect2] = []
	var camera_view_size := camera.get_viewport().get_visible_rect().size
	var annotation_scale := Vector2.ONE
	if camera_view_size.x > 0.0 and camera_view_size.y > 0.0:
		annotation_scale = Vector2(
			float(root.size.x) / camera_view_size.x,
			float(root.size.y) / camera_view_size.y,
		)
	for annotation in pending_annotations:
		var world_position: Vector3 = annotation["position"]
		if camera.is_position_behind(world_position):
			continue
		var screen_position := camera.unproject_position(world_position) * annotation_scale
		if screen_position.x < 0.0 or screen_position.x > float(root.size.x) \
				or screen_position.y < 0.0 or screen_position.y > float(root.size.y):
			continue
		var label_size := Vector2(176.0, 38.0)
		var label_position := Vector2(
			clampf(screen_position.x - label_size.x * 0.5, 8.0, float(root.size.x) - label_size.x - 8.0),
			clampf(screen_position.y - label_size.y * 0.5, 108.0, float(root.size.y) - label_size.y - 58.0),
		)
		var candidate := Rect2(label_position, label_size)
		for attempt in range(8):
			var overlaps := false
			for existing in occupied:
				if candidate.intersects(existing):
					overlaps = true
					break
			if not overlaps:
				break
			label_position.y += label_size.y + 3.0
			if label_position.y + label_size.y > float(root.size.y) - 54.0:
				label_position.y = 108.0
			candidate = Rect2(label_position, label_size)
		var label := Label.new()
		label.text = str(annotation["text"])
		label.position = label_position
		label.size = label_size
		label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		label.add_theme_font_size_override("font_size", 12)
		label.add_theme_color_override("font_color", Color("#f0e3c7"))
		var panel := StyleBoxFlat.new()
		panel.bg_color = Color("#1a2623", 0.94)
		panel.border_color = Color(PALETTE["brass"])
		panel.set_border_width_all(1)
		panel.set_content_margin_all(4.0)
		label.add_theme_stylebox_override("normal", panel)
		annotation_layer.add_child(label)
		occupied.append(candidate)


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
	var camera_focus := str(job.get("cameraFocus", ""))
	if camera_focus == "b1-gate":
		var gate: Array = plan.get("businessSuiteLayout", {}).get("b1", {}).get("exteriorGate", [])
		if gate.size() >= 2:
			var gate_target := Vector3(float(gate[0]) * STANDARD_SCALE, 0.82, float(gate[1]) * STANDARD_SCALE)
			camera.size = 18.0
			camera.far = 90.0
			camera.position = gate_target + Vector3(-12.0, 8.0, 0.0)
			camera.look_at(gate_target, Vector3.UP)
			return
	elif camera_focus == "b1-yard":
		var yard_props: Array = plan.get("businessSuiteLayout", {}).get("b1", {}).get("yardProps", [])
		if not yard_props.is_empty():
			var min_x := INF
			var min_z := INF
			var max_x := -INF
			var max_z := -INF
			for prop_value in yard_props:
				var prop_data: Dictionary = prop_value
				var position: Array = prop_data.get("position", [0, 0])
				min_x = minf(min_x, float(position[0]))
				min_z = minf(min_z, float(position[1]))
				max_x = maxf(max_x, float(position[0]))
				max_z = maxf(max_z, float(position[1]))
			var focus_center := Vector3(
				(min_x + max_x) * 0.5 * STANDARD_SCALE,
				0.8,
				(min_z + max_z) * 0.5 * STANDARD_SCALE,
			)
			camera.size = maxf((max_z - min_z) * STANDARD_SCALE * 1.15, 72.0)
			camera.far = camera.size * 4.0
			camera.position = focus_center + Vector3(0.0, camera.size * 1.5, 0.0)
			camera.look_at(focus_center, Vector3(0.0, 0.0, 1.0))
			return
	elif camera_focus == "f2-window":
		var window_center := Vector3(0.0, 1.35, depth / 7.0)
		camera.size = 10.0
		camera.far = 120.0
		camera.position = window_center + Vector3(10.0, 3.0, 0.0)
		camera.look_at(window_center, Vector3.UP)
		return
	elif camera_focus == "basement-department":
		var focus_center := Vector3(50.0, 0.0, 45.0)
		camera.size = 112.0
		camera.far = 280.0
		camera.position = focus_center + Vector3(70.0, 125.0, 95.0)
		camera.look_at(focus_center + Vector3(0.0, 0.3, 0.0), Vector3.UP)
		return
	var camera_center := center
	var framing_scale := 1.30
	if floor_number == 1:
		camera_center.z += depth * 0.27
		framing_scale = 1.20
	camera.size = maxf(dimension * framing_scale, 12.0)
	camera.far = maxf(dimension * 4.0, 250.0)
	camera.position = camera_center + Vector3(dimension * 0.70, dimension * 1.25, dimension * 0.95)
	camera.look_at(camera_center + Vector3(0.0, 0.3, 0.0), Vector3.UP)


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
