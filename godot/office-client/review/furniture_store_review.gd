extends SceneTree
## Native Godot furniture-store asset review; no Pygame art is loaded.

const Prop = preload("res://office_prop.gd")


func _initialize() -> void:
	call_deferred("_render")


func _material(color: String, metallic := 0.0) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = Color(color)
	material.metallic = metallic
	material.roughness = 0.76 if metallic == 0.0 else 0.42
	return material


func _box(parent: Node3D, at: Vector3, size: Vector3, color: String, metallic := 0.0) -> void:
	var instance := MeshInstance3D.new()
	var mesh := BoxMesh.new()
	mesh.size = size
	mesh.material = _material(color, metallic)
	instance.mesh = mesh
	instance.position = at
	parent.add_child(instance)


func _label(parent: Node3D, text: String, at: Vector3) -> void:
	var label := Label3D.new()
	label.text = text
	label.font_size = 34
	label.pixel_size = 0.008
	label.modulate = Color("#f0e3c7")
	label.position = at
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	parent.add_child(label)


func _render() -> void:
	var world := Node3D.new()
	root.add_child(world)
	var environment := WorldEnvironment.new()
	environment.environment = Environment.new()
	environment.environment.background_mode = Environment.BG_COLOR
	environment.environment.background_color = Color("#1a2623")
	environment.environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.environment.ambient_light_color = Color("#dbd3bc")
	environment.environment.ambient_light_energy = 0.72
	world.add_child(environment)
	var sunlight := DirectionalLight3D.new()
	sunlight.rotation_degrees = Vector3(-52, -30, 0)
	sunlight.light_color = Color("#ffe2b2")
	sunlight.light_energy = 1.1
	sunlight.shadow_enabled = true
	world.add_child(sunlight)

	_box(world, Vector3(0, -0.12, 0), Vector3(18, 0.24, 8.5), "#b9a889")
	_box(world, Vector3(0, 1.45, -4.1), Vector3(18, 2.9, 0.18), "#35574a")
	_box(world, Vector3(0, 0.16, -3.97), Vector3(17.8, 0.08, 0.04), "#ad884e", 0.55)
	for slat in range(30):
		_box(world, Vector3(-8.5 + float(slat) * 0.58, 1.48, -3.96), Vector3(0.026, 2.36, 0.04), "#6a7762")

	var chair: Node3D = Prop.create("furniture_lounge_chair")
	chair.position = Vector3(-6.2, 0, 0.0)
	world.add_child(chair)
	_label(world, "LOUNGE CHAIR", Vector3(-6.2, 2.18, 0.0))

	var couch: Node3D = Prop.create("furniture_couch")
	couch.position = Vector3(-2.0, 0, 0.0)
	world.add_child(couch)
	_label(world, "GREEN LEATHER COUCH", Vector3(-2.0, 2.18, 0.0))

	var sideboard: Node3D = Prop.create("furniture_sideboard")
	sideboard.position = Vector3(2.2, 0, 0.0)
	world.add_child(sideboard)
	_label(world, "WALNUT SIDEBOARD", Vector3(2.2, 2.18, 0.0))

	var shelf: Node3D = Prop.create("furniture_display_shelf")
	shelf.position = Vector3(6.1, 0, 0.0)
	world.add_child(shelf)
	_label(world, "DISPLAY SHELF", Vector3(6.1, 2.92, 0.0))

	var title := Label3D.new()
	title.text = "FURNITURE STORE  /  WALNUT · BRASS · GREEN ENAMEL"
	title.font_size = 38
	title.pixel_size = 0.008
	title.modulate = Color("#f0e3c7")
	title.position = Vector3(0, 3.3, -3.88)
	title.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	world.add_child(title)

	var camera := Camera3D.new()
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 16.5
	camera.position = Vector3(11.5, 9.0, 15.0)
	world.add_child(camera)
	camera.look_at(Vector3(0, 1.0, 0))
	camera.current = true
	for frame in range(18):
		await process_frame
	await RenderingServer.frame_post_draw
	var output := "user://furniture-store-review.png"
	var args := OS.get_cmdline_user_args()
	if not args.is_empty():
		output = args[0]
	var image := root.get_texture().get_image()
	var result := image.save_png(output)
	print("Native furniture review capture: ", output, " (", result, ")")
	quit(0 if result == OK else 1)
