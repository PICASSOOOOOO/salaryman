extends SceneTree

const SideScroller = preload("res://side_scroller_godot.gd")


func _initialize() -> void:
	var camera_offset := SideScroller.side_camera_offset()
	assert(is_zero_approx(camera_offset.x))
	assert(camera_offset.y > 0.0)
	assert(camera_offset.z > camera_offset.y)
	assert(SideScroller.side_camera_offset(10.0, 0.0) == Vector3(0.0, 0.0, 10.0))
	assert(SideScroller.SIDE_VIEW_ROOM_IDS.has("recreation"))
	assert(SideScroller.SIDE_VIEW_ROOM_IDS.has("floor07_business"))
	var prototype = SideScroller.new()
	prototype._build_materials()
	prototype._build_building_shell()
	var world_names := PackedStringArray()
	for child in prototype.world_root.get_children():
		var node_name := str(child.name)
		world_names.append(node_name)
		assert(
			node_name in SideScroller.SIDE_VIEW_ROOT_IDS
			or node_name == "SideViewWarmHallLight"
			or node_name.begins_with("recreation")
			or node_name.begins_with("floor07_business")
		)
	assert(world_names.has("recreationHallwayFloor0"))
	assert(world_names.has("floor07_businessFloor"))
	print("Side-view shell nodes: %d" % world_names.size())
	assert(world_names.size() < 500)
	prototype.free()
	print("Godot native side-view cutaway checks passed.")
	quit()
