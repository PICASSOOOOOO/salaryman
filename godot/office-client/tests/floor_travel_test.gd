extends SceneTree

const OfficeClient = preload("res://main.gd")
const OfficeProp = preload("res://office_prop.gd")
const CameraSfx = preload("res://camera_sfx.gd")
const PlayerController = preload("res://player_controller.gd")


func _initialize() -> void:
	call_deferred("_run_tests")


func _run_tests() -> void:
	var client = OfficeClient.new()
	var floor_plan = JSON.parse_string(FileAccess.get_file_as_string("res://floor_plan.json"))
	assert(floor_plan is Dictionary)
	client.floor_plan_data = floor_plan

	assert(OfficeClient.CAMERA_DISTANCE_LEVELS.size() == 3)
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
	assert(PlayerController.sprint_input_active(true, false))
	assert(PlayerController.sprint_input_active(false, true))
	assert(not PlayerController.sprint_input_active(false, false))
	var space_event := InputEventKey.new()
	space_event.keycode = KEY_SPACE
	space_event.pressed = true
	assert(PlayerController.is_jump_input(space_event))
	var left_click := InputEventMouseButton.new()
	left_click.button_index = MOUSE_BUTTON_LEFT
	left_click.pressed = true
	assert(PlayerController.is_jump_input(left_click))
	var right_click := InputEventMouseButton.new()
	right_click.button_index = MOUSE_BUTTON_RIGHT
	right_click.pressed = true
	assert(not PlayerController.is_jump_input(right_click))
	for zooming_in in [true, false]:
		var tone: AudioStreamWAV = CameraSfx.make_zoom_tone(zooming_in)
		assert(tone.mix_rate == 22050)
		assert(tone.data.size() > 0)
	assert(is_equal_approx(OfficeClient.door_swing_angle(false), 0.0))
	assert(is_equal_approx(OfficeClient.door_swing_angle(true), -0.42))

	var open_floors: Array[int] = client._available_elevator_floors()
	assert(open_floors == [1, 6])
	assert(client._tower_floor_status(1) == "open")
	assert(client._tower_floor_status(6) == "open")
	assert(client._tower_floor_status(0) == "under_construction")
	for floor_number in [2, 3, 4, 5, 7, 67]:
		assert(client._tower_floor_status(floor_number) == "under_construction")
	client.elevator_floor_panel = ColorRect.new()
	client.elevator_floor_panel.visible = true
	client.selected_elevator_floor = 1
	assert(client._handle_elevator_picker_key(KEY_UP))
	assert(client.selected_elevator_floor == 6)
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
	client.materials["door"] = StandardMaterial3D.new()
	client.materials["door_glass"] = StandardMaterial3D.new()
	client.materials["metal"] = StandardMaterial3D.new()
	var door: Node3D = client._build_door_visual(Vector3.ZERO, "test-door")
	assert(door.get_node_or_null("DoorPivot/DoorLeaf") is MeshInstance3D)
	assert(door.get_node_or_null("DoorPivot/DoorWindow") is MeshInstance3D)
	assert(client.dynamic_root.get_node_or_null("test-door/DoorPivot") is Node3D)
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

	print("Godot checks passed: camera levels/cues, privacy doors, floors 1/6, two-way cabin travel, cabin geometry, and trash-can model.")
	var dynamic_root: Node3D = client.dynamic_root
	client.free()
	dynamic_root.free()
	quit(0)
