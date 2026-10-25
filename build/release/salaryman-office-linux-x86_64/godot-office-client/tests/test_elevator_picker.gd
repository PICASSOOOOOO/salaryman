extends SceneTree

const TowerMain = preload("res://main.gd")


func _initialize() -> void:
	assert(
		TowerMain.elevator_boundary_notice(-1, [1, 2, 3]) == "LOWEST OPEN STOP IS FLOOR 01",
		"Lower-bound notice should reflect the actual lowest open floor.",
	)
	assert(
		TowerMain.elevator_boundary_notice(1, [1, 6, 12]) == "HIGHEST OPEN STOP IS FLOOR 12",
		"Upper-bound notice should reflect the actual highest open floor.",
	)
	assert(
		TowerMain.elevator_boundary_notice(-1, []) == "NO ELEVATOR STOPS ARE CURRENTLY OPEN",
		"An empty stop list should fail closed with an accurate message.",
	)
	quit()
