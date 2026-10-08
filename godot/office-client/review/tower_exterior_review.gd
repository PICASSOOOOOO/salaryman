extends SceneTree

const TowerExteriorWorld = preload("res://exterior_world.gd")


func _initialize() -> void:
	call_deferred("_render_review")


func _render_review() -> void:
	var floor_plan = JSON.parse_string(FileAccess.get_file_as_string("res://floor_plan.json"))
	if not floor_plan is Dictionary:
		push_error("Cannot render Tower exterior: floor_plan.json is invalid")
		quit(1)
		return
	var exterior := TowerExteriorWorld.build(floor_plan)
	if exterior == null:
		quit(1)
		return

	var stage := Node3D.new()
	stage.name = "TowerExteriorReview"
	get_root().add_child(stage)
	stage.add_child(exterior)

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

	var target := exterior.position + Vector3(38.0, 3.0, 0.0)
	var camera := Camera3D.new()
	camera.name = "ReviewCamera"
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 82.0
	camera.near = 0.05
	camera.far = 180.0
	camera.position = target + Vector3(42.0, 62.0, 72.0)
	stage.add_child(camera)
	camera.look_at(target, Vector3.UP)
	camera.current = true

	await process_frame
	await process_frame
	var image := get_root().get_texture().get_image()
	if image.is_empty():
		push_error("Tower exterior review viewport returned an empty image")
		quit(1)
		return
	var arguments := OS.get_cmdline_user_args()
	var output_path := arguments[0] if not arguments.is_empty() else "user://tower-exterior-review.png"
	var save_result := image.save_png(output_path)
	if save_result != OK:
		push_error("Could not save Tower exterior review: " + output_path)
		quit(1)
		return
	print("Saved Tower exterior review: ", output_path)
	quit()
