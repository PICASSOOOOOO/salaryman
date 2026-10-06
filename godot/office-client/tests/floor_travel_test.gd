extends SceneTree

const OfficeClient = preload("res://main.gd")
const OfficeProp = preload("res://office_prop.gd")


func _initialize() -> void:
	call_deferred("_run_tests")


func _run_tests() -> void:
	var client = OfficeClient.new()
	var floor_plan = JSON.parse_string(FileAccess.get_file_as_string("res://floor_plan.json"))
	assert(floor_plan is Dictionary)
	client.floor_plan_data = floor_plan

	var open_floors: Array[int] = client._available_elevator_floors()
	assert(open_floors == [1, 6])
	assert(client._tower_floor_status(1) == "open")
	assert(client._tower_floor_status(6) == "open")
	assert(client._tower_floor_status(0) == "under_construction")
	for floor_number in [2, 3, 4, 5, 7, 67]:
		assert(client._tower_floor_status(floor_number) == "under_construction")

	var up_offset: Vector3 = OfficeClient.elevator_travel_offset(1, 6)
	var down_offset: Vector3 = OfficeClient.elevator_travel_offset(6, 1)
	assert(up_offset.y > 0.0)
	assert(down_offset.y < 0.0)
	assert(is_equal_approx(absf(up_offset.y), absf(down_offset.y)))
	assert(OfficeClient.elevator_travel_offset(6, 6) == Vector3.ZERO)

	client.dynamic_root = Node3D.new()
	root.add_child(client.dynamic_root)
	client._build_elevator_transition_car(Vector3.ZERO)
	var cabin: Node3D = client.elevator_transition_root
	assert(cabin.name == "ElevatorCabin")
	for part_name in [
		"ElevatorFloor",
		"ElevatorRearGlass",
		"ElevatorLeftGlass",
		"ElevatorRightGlass",
		"ElevatorCanopy",
		"ElevatorLeftDoor",
		"ElevatorRightDoor",
		"ElevatorDestinationDisplay",
	]:
		assert(cabin.get_node_or_null(part_name) != null, part_name)

	var trash_can: Node3D = OfficeProp.create("trash_can")
	assert(trash_can.get_node_or_null("TrashCanBody") is MeshInstance3D)
	assert(trash_can.get_node_or_null("TrashCanLid") is MeshInstance3D)
	assert(trash_can.get_node_or_null("TrashCanPedal") is MeshInstance3D)
	trash_can.free()

	print("Godot checks passed: floors 1/6, two-way cabin travel, cabin geometry, and trash-can model.")
	var dynamic_root: Node3D = client.dynamic_root
	client.free()
	dynamic_root.free()
	quit(0)
