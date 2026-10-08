extends SceneTree

const TowerExteriorWorld = preload("res://exterior_world.gd")


func _initialize() -> void:
	call_deferred("_run_tests")


func _run_tests() -> void:
	var floor_plan_value = JSON.parse_string(FileAccess.get_file_as_string("res://floor_plan.json"))
	assert(floor_plan_value is Dictionary)
	var floor_plan: Dictionary = floor_plan_value
	var plan_value = JSON.parse_string(FileAccess.get_file_as_string("res://tower_exterior_plan.json"))
	assert(plan_value is Dictionary)
	assert(plan_value["version"] == 1)
	assert(plan_value["regions"].size() >= 5)
	assert(plan_value["landmarks"].size() >= 10)

	var exterior := TowerExteriorWorld.build(floor_plan)
	assert(exterior is Node3D)
	assert(exterior.name == "TowerExteriorWorld")
	assert(exterior.get_node_or_null("TerrainFoundation") is MeshInstance3D)
	assert(exterior.get_node_or_null("SemanticRegions") is Node3D)
	assert(exterior.get_node_or_null("EditableLandmarks") is Node3D)
	assert(exterior.position.is_equal_approx(Vector3(565.69, 0.0, 1046.52)))

	var generated_meshes := exterior.find_children("*", "MeshInstance3D", true, false)
	assert(generated_meshes.size() >= 60)
	assert(exterior.find_children("*", "CollisionObject3D", true, false).is_empty())
	assert(exterior.get_node("EditableLandmarks/tram_stop") is Node3D)
	assert(exterior.get_node("EditableLandmarks/district_center") is Node3D)

	print("Tower exterior generation tests passed (", generated_meshes.size(), " visual meshes)")
	exterior.free()
	quit()
