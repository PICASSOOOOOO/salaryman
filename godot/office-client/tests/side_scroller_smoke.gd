extends SceneTree

const SideScroller = preload("res://side_scroller_prototype.gd")


func _initialize() -> void:
	var bounds := Rect2(100.0, 200.0, 1000.0, 500.0)
	var left_front := SideScroller.project_world_position(
		Vector2(100.0, 200.0),
		bounds,
		1180.0,
		510.0,
	)
	var right_back := SideScroller.project_world_position(
		Vector2(1100.0, 700.0),
		bounds,
		1180.0,
		510.0,
	)
	assert(is_equal_approx(left_front.x, 72.0))
	assert(is_equal_approx(right_back.x, 910.0))
	assert(right_back.y < left_front.y)
	assert(SideScroller.adjacent_floor(6, 1) == 7)
	assert(SideScroller.adjacent_floor(7, -1) == 6)
	print("Side-scroller projection and adjacent-floor checks passed.")
	quit()
