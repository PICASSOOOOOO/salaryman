extends SceneTree

const OfficeClient = preload("res://main.gd")


func _initialize() -> void:
	call_deferred("_render_review")


func _render_review() -> void:
	var floor_plan = JSON.parse_string(FileAccess.get_file_as_string("res://floor_plan.json"))
	if not floor_plan is Dictionary:
		push_error("Cannot render Tower window view: floor_plan.json is invalid")
		quit(1)
		return

	var stage := Node3D.new()
	stage.name = "TowerExteriorWindowReview"
	get_root().add_child(stage)

	var client := OfficeClient.new()
	client._build_materials()
	client._build_building_shell()
	var tower_world_root: Node3D = client.world_root
	var exterior := tower_world_root.get_node_or_null("TowerExteriorBackdrop") as Node3D
	if exterior == null:
		push_error("Tower window review cannot find the integrated exterior backdrop")
		client.free()
		stage.free()
		quit(1)
		return
	client.remove_child(tower_world_root)
	stage.add_child(tower_world_root)
	client.free()

	var environment := WorldEnvironment.new()
	var environment_data := Environment.new()
	environment_data.background_mode = Environment.BG_COLOR
	environment_data.background_color = Color("#bdcbb7")
	environment_data.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment_data.ambient_light_color = Color("#e2ddc9")
	environment_data.ambient_light_energy = 0.8
	environment.environment = environment_data
	stage.add_child(environment)

	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-48.0, -32.0, 0.0)
	sun.light_color = Color("#ffe7bf")
	sun.light_energy = 1.2
	sun.shadow_enabled = true
	stage.add_child(sun)

	# Review from just inside the real west-side window, looking toward the
	# integrated landscape row around z=145 m.
	var window_center := Vector3(-0.15, 1.55, 155.56)
	var camera := Camera3D.new()
	camera.name = "ReviewCamera"
	camera.projection = Camera3D.PROJECTION_PERSPECTIVE
	camera.fov = 62.0
	camera.near = 0.05
	camera.far = 180.0
	camera.position = Vector3(0.05, 1.62, window_center.z)
	stage.add_child(camera)
	camera.look_at(Vector3(-35.0, 1.0, window_center.z), Vector3.UP)
	camera.current = true

	await process_frame
	await process_frame
	var image := get_root().get_texture().get_image()
	if image.is_empty():
		push_error("Tower window review viewport returned an empty image")
		stage.free()
		quit(1)
		return
	var arguments := OS.get_cmdline_user_args()
	var output_path := arguments[0] if not arguments.is_empty() else "user://tower-window-review.png"
	var save_result := image.save_png(output_path)
	if save_result != OK:
		push_error("Could not save Tower window review: " + output_path)
		stage.free()
		quit(1)
		return
	print("Saved full Tower through-window review: ", output_path)
	stage.free()
	quit()
