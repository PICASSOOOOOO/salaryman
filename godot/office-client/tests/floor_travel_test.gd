extends SceneTree

const OfficeClient = preload("res://main.gd")
const OfficeProp = preload("res://office_prop.gd")
const CameraSfx = preload("res://camera_sfx.gd")
const PlayerController = preload("res://player_controller.gd")


func _initialize() -> void:
	call_deferred("_run_tests")


func _run_tests() -> void:
	var hud_min_width := int(ProjectSettings.get_setting("display/window/size/min_width"))
	var hud_min_height := int(ProjectSettings.get_setting("display/window/size/min_height"))
	assert(hud_min_width == 1180 and hud_min_height == 720)
	var wide_hud: Dictionary = OfficeClient.hud_layout_for_viewport(Vector2(1920.0, 1080.0))
	assert(is_equal_approx(float(wide_hud["scale"]), 1.5))
	assert(wide_hud["position"] == Vector2(75.0, 0.0))
	var design_hud: Dictionary = OfficeClient.hud_layout_for_viewport(Vector2(1180.0, 720.0))
	assert(is_equal_approx(float(design_hud["scale"]), 1.0))
	assert(design_hud["position"] == Vector2.ZERO)
	var invalid_hud: Dictionary = OfficeClient.hud_layout_for_viewport(Vector2.ZERO)
	assert(is_equal_approx(float(invalid_hud["scale"]), 0.0))

	var client = OfficeClient.new()
	var floor_plan = JSON.parse_string(FileAccess.get_file_as_string("res://floor_plan.json"))
	assert(floor_plan is Dictionary)
	client.floor_plan_data = floor_plan
	client.world_root = Node3D.new()
	root.add_child(client.world_root)
	client._build_materials()
	client._add_business_suite_finish(
		"office_03",
		"TestFishStore",
		[1_000, 1_000, 3_000, 2_000],
		{"businessKey": "fish-store"},
	)
	assert(client.world_root.get_node_or_null("TestFishStoreStoreFinishFloor") != null)
	assert(client.world_root.get_node_or_null("TestFishStoreStoreWallNorth") != null)
	assert(client.world_root.get_node_or_null("TestFishStoreStoreThreshold") != null)
	assert(client.world_root.get_node_or_null("TestFishStoreStorageFloor") != null)
	assert(client.world_root.get_node_or_null("TestFishStoreStoragePartitionL") != null)
	assert(client.world_root.get_node_or_null("TestFishStoreStorageRack0") != null)
	client._add_business_suite_finish(
		"office_03",
		"TestNorthDoorStore",
		[1_000, 1_000, 3_000, 2_000],
		{"businessKey": "plant_store"},
		"north",
	)
	assert(client.world_root.get_node_or_null("TestNorthDoorStoreStoreWallNorthL") != null)
	assert(client.world_root.get_node_or_null("TestNorthDoorStoreStoreWallSouth") != null)
	assert(client.world_root.get_node_or_null("TestNorthDoorStoreStorageFloor") != null)
	client._build_business_suite_layout(floor_plan)
	var display_markers := {
		"shadow_cafeteria": "DisplayLeft",
		"tower_clinic": "DisplayLeftCabinet",
		"formal_clothing_store": "DisplayLeftPlinth",
		"tool_store": "DisplayBench",
		"banco_ombra": "DisplayServiceDesk",
		"furniture-store": "DisplayFurniturePlinth",
		"fish-store": "DisplayLeftCase",
	}
	for floor_number in range(2, 7):
		var floor_data: Dictionary = floor_plan["playableFloors"][str(floor_number)]
		var businesses: Array = floor_data["businesses"]
		assert(businesses.size() == 8)
		var assigned_units: Dictionary = {}
		for business_value in businesses:
			var business: Dictionary = business_value
			var business_key := str(business["businessKey"])
			var unit_number := int(business["unitNumber"])
			assert(unit_number >= 1 and unit_number <= 8)
			assert(not assigned_units.has(unit_number))
			assigned_units[unit_number] = true
			assert(client.get_node_or_null("BusinessSign_%s" % business_key) != null)
			assert(client.world_root.get_node_or_null(
				"Floor%02dUnit%02dStoreFinishFloor" % [floor_number, unit_number]
			) != null)
			assert(client.world_root.get_node_or_null(
				"Floor%02dUnit%02dDisplayPrimary" % [floor_number, unit_number]
			) != null)
			assert(client.world_root.get_node_or_null(
				"Floor%02dUnit%02dDisplayPrimaryCollider" % [floor_number, unit_number]
			) != null)
			if display_markers.has(business_key):
				assert(client.world_root.get_node_or_null(
					"Floor%02dUnit%02d%s" % [floor_number, unit_number, display_markers[business_key]]
				) != null)
	var floor_four_businesses: Array = floor_plan["playableFloors"]["4"]["businesses"]
	assert(floor_four_businesses.back()["businessKey"] == "public_locker_shop")
	var locker_display: MeshInstance3D = client.world_root.get_node("Floor04Unit08DisplayPrimary")
	var locker_display_mesh: BoxMesh = locker_display.mesh
	assert(locker_display.position.y - locker_display_mesh.size.y / 2.0 >= 0.194)
	var locker_display_collider: StaticBody3D = client.world_root.get_node("Floor04Unit08DisplayPrimaryCollider")
	assert(locker_display_collider.collision_layer == 1)
	assert(floor_plan["businessSuiteLayout"]["lobbyKiosks"].size() == 2)
	assert(floor_plan["playableFloors"]["7"]["businesses"].is_empty())
	assert(str(floor_plan["playableFloors"]["7"]["label"]).contains("MEDITATION TEMPLE"))
	for floor_number in range(8, 13):
		for business_value in floor_plan["playableFloors"][str(floor_number)]["businesses"]:
			var high_floor_business: Dictionary = business_value
			assert(client.world_root.get_node_or_null(
				"Floor%02dUnit%02dDisplayPrimary" % [floor_number, int(high_floor_business["unitNumber"])]
			) == null)
	var base_layout: Dictionary = floor_plan["baseLayout"]
	var lobby_bounds: Array = base_layout["elevatorLobby"]["bounds"]
	var main_hall: Array = base_layout["hallways"][0]
	var lobby_origin: Vector2i = OfficeClient.lobby_render_origin_from_plan(
		lobby_bounds,
		main_hall,
		int(floor_plan["lobbyHallwayOpening"]),
	)
	assert(lobby_bounds[0] + int(floor_plan["lobbyHallwayOpening"]) - lobby_origin.x == main_hall[0] + main_hall[2] / 2)
	assert(lobby_bounds[1] + lobby_bounds[3] - lobby_origin.y == 0)
	var reception_render_px: Vector2i = OfficeClient.lobby_local_render_position(
		Vector2i(1900, 2200),
		lobby_bounds,
		lobby_origin,
	)
	var lobby_render_left := int(lobby_bounds[0]) - lobby_origin.x
	var lobby_render_top := int(lobby_bounds[1]) - lobby_origin.y
	assert(reception_render_px.x >= lobby_render_left)
	assert(reception_render_px.x <= lobby_render_left + int(lobby_bounds[2]))
	assert(reception_render_px.y >= lobby_render_top)
	assert(reception_render_px.y <= lobby_render_top + int(lobby_bounds[3]))
	assert(int(base_layout["clearEnvelopeUnits"][0]) == 62_225)
	assert(int(base_layout["clearEnvelopeUnits"][1]) == 70_711)
	assert(is_equal_approx(float(base_layout["structure"]["wallThicknessMeters"]), 0.3))
	assert(is_equal_approx(float(base_layout["structure"]["wallServiceCavityMeters"]), 0.12))
	var b1_layout: Dictionary = floor_plan["businessSuiteLayout"]["b1"]
	assert(b1_layout["exteriorLoadingYardHalf"].size() == 4)
	assert(b1_layout["exteriorGate"].size() == 2)
	var b1_room_bounds: Array = b1_layout["bounds"]
	var b1_interior: Array = b1_layout["interiorBusinessHalf"]
	var b1_yard: Array = b1_layout["exteriorLoadingYardHalf"]
	assert(b1_room_bounds.size() == 4)
	assert(int(b1_room_bounds[0]) == 0 and int(b1_room_bounds[1]) == 0)
	assert(int(b1_room_bounds[2]) == 56_569 and int(b1_room_bounds[3]) == 28_284)
	assert(b1_interior[0] == b1_room_bounds[0] and b1_interior[1] == b1_room_bounds[1])
	assert(b1_yard[0] == b1_interior[0] + b1_interior[2])
	assert(b1_interior[2] + b1_yard[2] == b1_room_bounds[2])
	assert(b1_interior[3] == b1_room_bounds[3] and b1_yard[3] == b1_room_bounds[3])
	assert(b1_layout["yardAccess"][0] == b1_yard[0])
	assert(b1_layout["exteriorGate"][0] == b1_room_bounds[0] + b1_room_bounds[2])
	var b1_routes: Dictionary = floor_plan["infrastructureMap"]["b1LoadingYard"]
	assert(b1_routes["interiorBusinessHalf"] == b1_interior)
	assert(b1_routes["exteriorLoadingYardHalf"] == b1_yard)

	assert(OfficeClient.CAMERA_DISTANCE_LEVELS.size() == 3)
	assert(OfficeClient.CAMERA_DEFAULT_ZOOM_INDEX == 0)
	assert(is_equal_approx(
		OfficeClient.camera_distance_for_level(OfficeClient.CAMERA_DEFAULT_ZOOM_INDEX),
		8.0,
	))
	assert(is_equal_approx(OfficeClient.camera_distance_for_level(0), 8.0))
	assert(is_equal_approx(OfficeClient.camera_distance_for_level(1), 13.0))
	assert(is_equal_approx(OfficeClient.camera_distance_for_level(2), 21.0))
	assert(OfficeClient.next_camera_zoom_level(1, -1) == 0)
	assert(OfficeClient.next_camera_zoom_level(1, 1) == 2)
	assert(OfficeClient.next_camera_zoom_level(0, -1) == 0)
	assert(OfficeClient.next_camera_zoom_level(2, 1) == 2)
	assert(OfficeClient.terminal_choice_for_key(KEY_1) == 1)
	assert(OfficeClient.terminal_choice_for_key(KEY_9) == 9)
	assert(OfficeClient.terminal_choice_for_key(KEY_ESCAPE) == 0)
	var settings_text := OfficeClient.settings_menu_text("FLOOR 01", false)
	assert(settings_text.contains("CONTROLS"))
	assert(settings_text.contains("DISPLAY"))
	assert(settings_text.contains("A / Cross — interact"))
	assert(settings_text.contains("minimum 1180 × 720"))
	assert(OfficeClient.feature_panel_uses_command_style("phone"))
	assert(OfficeClient.feature_panel_uses_command_style("reception"))
	assert(OfficeClient.feature_panel_uses_command_style("systems"))
	assert(not OfficeClient.feature_panel_uses_command_style("customize"))
	assert(not OfficeClient.feature_panel_uses_command_style("office_builder"))
	assert(not OfficeClient.feature_panel_uses_command_style("office-builder"))
	assert(not OfficeClient.feature_panel_uses_command_style("sim_systems"))
	assert(not OfficeClient.feature_panel_uses_command_style("simulation systems"))
	assert(OfficeClient.feature_panel_template_for("phone", "pay_phone") == "communications")
	assert(OfficeClient.feature_panel_template_for("systems", "crt_terminal") == "terminal")
	assert(OfficeClient.feature_panel_template_for("reception", "receptionist") == "services")
	assert(OfficeClient.feature_panel_template_for("vending", "vending_machine") == "supply")
	assert(OfficeClient.feature_panel_template_for("economy", "atm") == "finance")
	assert(OfficeClient.feature_panel_template_for("utility_work", "") == "operations")
	assert(OfficeClient.feature_panel_template_for("customize", "terminal") == "plain")
	assert(
		OfficeClient.feature_panel_command_text("CONNECTED\nChoose an action")
		== "> CONNECTED\n> Choose an action"
	)
	var floor_style_keys := {}
	var floor_colors := {}
	for floor_number in range(1, 13):
		var style := OfficeClient.tower_floor_style_palette(floor_number, "")
		var style_key := str(style["key"])
		var floor_color := str(style["floor"])
		assert(not floor_style_keys.has(style_key))
		assert(not floor_colors.has(floor_color))
		floor_style_keys[style_key] = true
		floor_colors[floor_color] = true
	for basement_number in range(1, 7):
		var basement_style := OfficeClient.tower_floor_style_palette(
			-basement_number,
			"basement_b%d" % basement_number,
		)
		var basement_key := str(basement_style["key"])
		var basement_color := str(basement_style["floor"])
		assert(not floor_style_keys.has(basement_key))
		assert(not floor_colors.has(basement_color))
		floor_style_keys[basement_key] = true
		floor_colors[basement_color] = true
	for material_name in [
		"floor", "hall_floor", "construction_floor", "temple_floor", "lobby_floor",
		"office_1", "office_2", "office_3", "office_4", "wall", "wall_trim",
	]:
		client.materials[material_name] = StandardMaterial3D.new()
	client._apply_tower_floor_style(6, "executive")
	var concourse_style: Dictionary = OfficeClient.tower_floor_style_palette(6, "executive")
	for material_name in [
		"floor", "hall_floor", "construction_floor", "temple_floor", "lobby_floor",
		"office_1", "office_2", "office_3", "office_4",
	]:
		assert(
			client.materials[material_name].albedo_color == concourse_style["floor"],
			"Floor style must tint %s" % material_name,
		)
	assert(client.materials["wall"].albedo_color == concourse_style["wall"])
	assert(client.materials["wall_trim"].albedo_color == concourse_style["trim"])
	assert(PlayerController.sprint_input_active(true, false))
	assert(PlayerController.sprint_input_active(false, true))
	assert(not PlayerController.sprint_input_active(false, false))
	assert(not PlayerController.weapon_action_allowed(false))
	assert(PlayerController.weapon_action_allowed(true))
	var player_controller = PlayerController.new()
	assert(player_controller.toggle_mouse_sprint())
	assert(not player_controller.toggle_mouse_sprint())
	player_controller.free()
	var space_event := InputEventKey.new()
	space_event.keycode = KEY_SPACE
	space_event.pressed = true
	assert(PlayerController.is_jump_input(space_event))
	var left_click := InputEventMouseButton.new()
	left_click.button_index = MOUSE_BUTTON_LEFT
	left_click.pressed = true
	assert(not PlayerController.is_jump_input(left_click))
	var right_click := InputEventMouseButton.new()
	right_click.button_index = MOUSE_BUTTON_RIGHT
	right_click.pressed = true
	assert(not PlayerController.is_jump_input(right_click))
	var wheel_down := InputEventMouseButton.new()
	wheel_down.button_index = MOUSE_BUTTON_WHEEL_DOWN
	wheel_down.pressed = true
	assert(PlayerController.is_jump_input(wheel_down))
	var wheel_up := InputEventMouseButton.new()
	wheel_up.button_index = MOUSE_BUTTON_WHEEL_UP
	wheel_up.pressed = true
	assert(not PlayerController.is_jump_input(wheel_up))
	assert(
		PlayerController.gamepad_movement_vector(0.1, 0.1).is_zero_approx(),
		"Small stick drift should stay inside the deadzone.",
	)
	var stick_move := PlayerController.gamepad_movement_vector(-0.8, 0.0)
	assert(is_equal_approx(stick_move.x, -0.8))
	assert(
		PlayerController.gamepad_movement_vector(0.0, 0.0, 1.0, 0.0)
			.is_equal_approx(Vector2.RIGHT),
		"D-pad should move when the analog stick is idle.",
	)
	assert(PlayerController.keycode_for_joypad_button(JOY_BUTTON_A) == KEY_E)
	assert(
		PlayerController.keycode_for_joypad_button(JOY_BUTTON_A, true) == KEY_ENTER,
		"Primary action should activate focused menus.",
	)
	assert(PlayerController.keycode_for_joypad_button(JOY_BUTTON_B) == KEY_ESCAPE)
	assert(PlayerController.keycode_for_joypad_button(JOY_BUTTON_X) == KEY_SPACE)
	assert(PlayerController.keycode_for_joypad_button(JOY_BUTTON_LEFT_SHOULDER) == KEY_SHIFT)
	assert(PlayerController.keycode_for_joypad_button(JOY_BUTTON_DPAD_UP) == KEY_UP)
	for zooming_in in [true, false]:
		var tone: AudioStreamWAV = CameraSfx.make_zoom_tone(zooming_in)
		assert(tone.mix_rate == 22050)
		assert(tone.data.size() > 0)
	assert(is_equal_approx(OfficeClient.door_swing_angle(false), 0.0))
	assert(is_equal_approx(OfficeClient.door_swing_angle(true), -1.45))
	assert(OfficeClient.elevator_indicator_text("lobby", 1, 0) == "01")
	assert(OfficeClient.elevator_indicator_text("recreation", 6, 0) == "06")
	assert(OfficeClient.elevator_indicator_text("basement_b4", 1, 2) == "B4")
	assert(OfficeClient.elevator_indicator_text("basement_b", 1, 2) == "B2")
	assert(OfficeClient.elevator_indicator_text("", 1, 3) == "B3")
	assert(OfficeClient.safe_int(null, 7) == 7)
	assert(OfficeClient.safe_int("not-an-integer", 3) == 3)
	assert(OfficeClient.safe_int(2.6) == 3)
	assert(OfficeClient.elevator_indicator_text("", 0, 0) == "01")
	for kind in [
		"fire_extinguisher", "temple_tree", "reflection_screen", "meditation_cushion",
		"temple_audio_control", "chapel_pew", "chapel_altar", "library_shelf",
		"reading_table", "museum_case",
	]:
		assert(OfficeProp.SUPPORTED_KINDS.has(kind))
		var prop: Node3D = OfficeProp.create(kind)
		assert(prop is Node3D)
		prop.free()
	var temple_midpoint: Vector2 = client._temple_music_sample(0)
	assert(absf(temple_midpoint.x) < 0.05)
	assert(absf(temple_midpoint.y) < 0.05)
	assert(client._temple_music_sample(12_345).length() > 0.001)
	assert(not client.temple_music_enabled)
	client._toggle_temple_music()
	assert(client.temple_music_enabled)
	client._toggle_temple_music()
	assert(not client.temple_music_enabled)

	var open_floors: Array[int] = client._available_elevator_floors()
	assert(open_floors.size() == 12)
	for floor_number in range(1, 13):
		assert(open_floors.has(floor_number))
	assert(client._tower_floor_status(1) == "open")
	assert(client._tower_floor_status(2) == "construction_open")
	assert(client._tower_floor_status(3) == "construction_open")
	assert(client._tower_floor_status(4) == "construction_open")
	assert(client._tower_floor_status(5) == "construction_open")
	assert(client._tower_floor_status(6) == "open")
	assert(client._tower_floor_status(0) == "open")
	assert(not open_floors.has(0))
	assert(client._tower_floor_status(7) == "open")
	for floor_number in range(8, 13):
		assert(client._tower_floor_status(floor_number) == "open")
	assert(client._tower_floor_status(13) == "under_construction")
	assert(client._tower_floor_status(67) == "under_construction")
	assert(
		OfficeClient.staircase_construction_notice("construction_open", floor_plan["floorBuildStatus"])
		== "CONSTRUCTION IN PROGRESS\nFLOORS 02–05"
	)
	assert(
		OfficeClient.staircase_construction_notice("under_construction", floor_plan["floorBuildStatus"])
		== "UNDER CONSTRUCTION\nFLOORS 13–67"
	)
	assert(
		OfficeClient.staircase_construction_notice("missing", {})
		== "TOWER ACCESS STATUS UNAVAILABLE"
	)
	client.elevator_floor_panel = ColorRect.new()
	client.elevator_floor_panel.visible = true
	client.selected_elevator_floor = 1
	assert(client._handle_elevator_picker_key(KEY_UP))
	assert(client.selected_elevator_floor == 2)
	assert(client._handle_elevator_picker_key(KEY_DOWN))
	assert(client.selected_elevator_floor == 1)
	client.elevator_floor_panel.free()
	client.elevator_floor_panel = null

	var up_offset: Vector3 = OfficeClient.elevator_travel_offset(1, 6)
	var down_offset: Vector3 = OfficeClient.elevator_travel_offset(6, 1)
	assert(up_offset.y > 0.0)
	assert(down_offset.y < 0.0)
	assert(is_equal_approx(absf(up_offset.y), absf(down_offset.y)))
	assert(OfficeClient.elevator_travel_offset(6, 6) == Vector3.ZERO)

	client.dynamic_root = Node3D.new()
	root.add_child(client.dynamic_root)
	for material_name in ["wall", "crt_screen", "wall_trim", "metal", "lamp_glow"]:
		client.materials[material_name] = StandardMaterial3D.new()
	client._build_elevator_visual(Vector3.ZERO, "test-elevator")
	var elevator_indicator := client.dynamic_root.get_node_or_null(
		"test-elevator-floor-display-text"
	) as Label3D
	assert(elevator_indicator != null)
	assert(client.dynamic_root.get_node_or_null("test-elevator-freight-sign") == null)
	client._build_elevator_visual(Vector3(4.0, 0.0, 0.0), "test-service-elevator", true)
	assert(client.dynamic_root.get_node_or_null("test-service-elevator-freight-sign") is Label3D)
	assert(client.dynamic_root.get_node_or_null("test-service-elevator-safety-stripe-0") is MeshInstance3D)
	client._sync_elevator_floor_indicators({
		"room": "basement_b4",
		"floor": 1,
		"basementLevel": 2,
		"objects": [{"kind": "service_elevator", "id": "test-elevator"}],
	})
	assert(elevator_indicator.text == "B4")
	client.materials["door"] = StandardMaterial3D.new()
	client.materials["door_glass"] = StandardMaterial3D.new()
	var door: Node3D = client._build_door_visual(Vector3.ZERO, "test-door")
	assert(door.get_node_or_null("DoorPivot/DoorLeaf") is MeshInstance3D)
	assert(door.get_node_or_null("DoorPivot/DoorWindow") is MeshInstance3D)
	assert(client.dynamic_root.get_node_or_null("test-door/DoorPivot") is Node3D)
	client._sync_door_states([{"kind": "door", "id": "test-door", "doorOpen": true}])
	assert(bool(door.get_meta("door_open", false)))
	client._sync_door_states([{"kind": "door", "id": "test-door", "doorOpen": false}])
	assert(not bool(door.get_meta("door_open", false)))
	client._build_elevator_transition_car(Vector3.ZERO)
	var cabin: Node3D = client.elevator_transition_root
	assert(cabin.name == "ElevatorCabin")
	for part_name in [
		"ElevatorFloor",
		"ElevatorRearGlass",
		"ElevatorLeftGlass",
		"ElevatorRightGlass",
		"ElevatorCanopy",
		"ElevatorRearFog",
		"ElevatorLeftFog",
		"ElevatorRightFog",
		"ElevatorLeftDoor",
		"ElevatorRightDoor",
		"ElevatorDestinationDisplay",
	]:
		assert(cabin.get_node_or_null(part_name) != null, part_name)
	assert(client.elevator_transition_fog_material.albedo_color.a > 0.8)

	var trash_can: Node3D = OfficeProp.create("trash_can")
	assert(trash_can.get_node_or_null("TrashCanBody") is MeshInstance3D)
	assert(trash_can.get_node_or_null("TrashCanLid") is MeshInstance3D)
	assert(trash_can.get_node_or_null("TrashCanPedal") is MeshInstance3D)
	trash_can.free()

	print("Godot checks passed: camera cues, privacy doors, Floors 1–12, tower props, temple audio, cabin travel, and hallway fixtures.")
	var dynamic_root: Node3D = client.dynamic_root
	client.free()
	dynamic_root.free()
	quit(0)
