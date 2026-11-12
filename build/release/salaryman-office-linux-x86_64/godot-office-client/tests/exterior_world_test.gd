extends SceneTree

const TowerExteriorWorld = preload("res://exterior_world.gd")
const OfficeClient = preload("res://main.gd")


func _initialize() -> void:
	call_deferred("_run_tests")


func _run_tests() -> void:
	var floor_plan_value = JSON.parse_string(FileAccess.get_file_as_string("res://floor_plan.json"))
	assert(floor_plan_value is Dictionary)
	var floor_plan: Dictionary = floor_plan_value
	var plan_value = JSON.parse_string(FileAccess.get_file_as_string("res://tower_exterior_plan.json"))
	assert(plan_value is Dictionary)
	assert(plan_value["version"] == 2)
	assert(plan_value["facades"] is Array)
	assert(plan_value["facades"].size() == 2)
	assert(plan_value["facades"][0]["side"] == "west")
	assert(plan_value["facades"][1]["side"] == "east")

	var exterior := TowerExteriorWorld.build(floor_plan)
	assert(exterior is Node3D)
	assert(exterior.name == "TowerExteriorBackdrop")
	assert(exterior.get_node_or_null("WestLandscape/TerrainFoundation") is MeshInstance3D)
	assert(exterior.get_node_or_null("EastLandscape/TerrainFoundation") is MeshInstance3D)
	assert(exterior.position.is_zero_approx())

	var generated_meshes := exterior.find_children("*", "MeshInstance3D", true, false)
	assert(generated_meshes.size() >= 200)
	assert(exterior.find_children("*", "CollisionObject3D", true, false).is_empty())
	assert(exterior.get_node("WestLandscape/west_midrise_00") is Node3D)
	assert(exterior.get_node("EastLandscape/east_midrise_00") is Node3D)

	print("Tower window-backdrop tests passed (", generated_meshes.size(), " visual meshes)")
	exterior.free()

	var client = OfficeClient.new()
	client._build_materials()
	client._build_building_shell()
	var integrated_world = client.world_root.get_node_or_null("TowerExteriorBackdrop")
	assert(integrated_world is Node3D)
	assert(integrated_world.get_node_or_null("WestLandscape") is Node3D)
	assert(integrated_world.get_node_or_null("EastLandscape") is Node3D)
	var actual_window := client.world_root.get_node("executive_suiteOutsideWallGlass0") as MeshInstance3D
	assert(actual_window is MeshInstance3D)
	var window_material := actual_window.mesh.surface_get_material(0) as StandardMaterial3D
	assert(window_material.transparency == BaseMaterial3D.TRANSPARENCY_ALPHA)
	assert(window_material.albedo_color.a < 0.2)
	var facade_windows: Array = client.world_root.find_children(
		"commercial_floorWallLeftGlass*",
		"MeshInstance3D",
		true,
		false,
	)
	var overlapping_facade_window_found := false
	for facade_window_value in facade_windows:
		var facade_window := facade_window_value as MeshInstance3D
		if absf(facade_window.position.z - 155.56) < 0.05:
			overlapping_facade_window_found = true
			var facade_material := facade_window.mesh.surface_get_material(0) as StandardMaterial3D
			assert(facade_material.transparency == BaseMaterial3D.TRANSPARENCY_ALPHA)
			break
	assert(overlapping_facade_window_found, "Overlapping Tower facades must align at the executive-suite window")
	var suite_windows: Array = client.world_root.find_children(
		"Floor02Unit01WestGlass*",
		"MeshInstance3D",
		true,
		false,
	)
	var suite_window_aligned := false
	for suite_window_value in suite_windows:
		var suite_window := suite_window_value as MeshInstance3D
		if absf(suite_window.position.z - 155.56) < 0.05:
			suite_window_aligned = true
			break
	assert(suite_window_aligned, "Perimeter suite walls must preserve the Tower window sightline")
	client.free()
	quit()
