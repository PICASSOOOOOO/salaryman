extends SceneTree
## Actual Godot render of native models; this is an asset review, not gameplay footage.

const Prop = preload("res://office_prop.gd")
const Service = preload("res://office_service_prop.gd")


func _initialize() -> void:
	call_deferred("_render")


func _material(color: String) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = Color(color)
	material.roughness = 0.90
	return material


func _box(parent: Node3D, at: Vector3, size: Vector3, color: String) -> void:
	var instance := MeshInstance3D.new()
	var mesh := BoxMesh.new()
	mesh.size = size
	mesh.material = _material(color)
	instance.mesh = mesh
	instance.position = at
	parent.add_child(instance)


func _place(parent: Node3D, kind: String, at: Vector3, reception := false) -> Node3D:
	var prop := Service.create_service(kind) if kind in Service.SERVICE_KINDS else Prop.create(kind, reception)
	prop.position = at
	parent.add_child(prop)
	return prop


func _render() -> void:
	var world := Node3D.new()
	root.add_child(world)
	var environment := WorldEnvironment.new()
	environment.environment = Environment.new()
	environment.environment.background_mode = Environment.BG_COLOR
	environment.environment.background_color = Color("#1a2623")
	environment.environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.environment.ambient_light_color = Color("#dbd3bc")
	environment.environment.ambient_light_energy = 0.65
	world.add_child(environment)
	var sunlight := DirectionalLight3D.new()
	sunlight.rotation_degrees = Vector3(-55, -28, 0)
	sunlight.light_color = Color("#ffe2b2")
	sunlight.light_energy = 1.0
	sunlight.shadow_enabled = true
	world.add_child(sunlight)
	_box(world, Vector3(0, -0.10, 0), Vector3(12, 0.20, 10), "#b9a889")
	_box(world, Vector3(0, 1.3, -4.5), Vector3(12, 2.6, 0.16), "#35574a")
	_box(world, Vector3(-5.9, 1.3, 0), Vector3(0.16, 2.6, 9), "#35574a")
	_box(world, Vector3(0, 0.10, -4.38), Vector3(11.8, 0.20, 0.06), "#ad884e")
	for slat in range(23):
		_box(world, Vector3(-5.5 + slat * 0.50, 1.4, -4.39), Vector3(0.025, 2.20, 0.045), "#6a7762")

	_place(world, "desk", Vector3(-1.8, 0, -2.3), true)
	_place(world, "desk", Vector3(-1.0, 0, 1.4))
	_place(world, "telephone", Vector3(-1.75, 0, 1.08))
	_place(world, "desk_lamp", Vector3(-0.05, 0, 1.10))
	_place(world, "atm", Vector3(1.30, 0, -2.80))
	_place(world, "vending_machine", Vector3(2.65, 0, -2.80))
	_place(world, "pay_phone", Vector3(4.0, 0, -2.30))
	var worn_desk := _place(world, "desk", Vector3(2.85, 0, 2.6))
	worn_desk.set_surface_state(45, 55)
	var worn_phone := _place(world, "telephone", Vector3(2.15, 0, 2.30))
	worn_phone.set_surface_state(45, 55)
	_place(world, "desk_lamp", Vector3(3.75, 0, 2.30))
	_place(world, "chair", Vector3(-1.0, 0, 2.65))
	var worn_chair := _place(world, "chair", Vector3(2.85, 0, 3.85))
	worn_chair.set_surface_state(45, 55)

	var camera := Camera3D.new()
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 12.5
	camera.position = Vector3(10, 11, 14)
	world.add_child(camera)
	camera.look_at(Vector3(0, 0.5, -0.1))
	camera.current = true
	var canvas := CanvasLayer.new()
	root.add_child(canvas)
	var title := Label.new()
	title.text = "SALARYMAN OS  /  NATIVE OFFICE ASSET REVIEW"
	title.position = Vector2(38, 28)
	title.add_theme_font_size_override("font_size", 24)
	title.add_theme_color_override("font_color", Color("#f0e3c7"))
	canvas.add_child(title)
	var caption := Label.new()
	caption.text = "WALNUT + BRASS  ·  GREEN ENAMEL  ·  UPHOLSTERED CHAIR  ·  ATM  ·  VENDING\nRight-hand workstation shows existing wear data. Review scene only; not a released build."
	caption.position = Vector2(38, 910)
	caption.add_theme_font_size_override("font_size", 18)
	caption.add_theme_color_override("font_color", Color("#f0e3c7"))
	canvas.add_child(caption)
	for frame in range(15):
		await process_frame
	await RenderingServer.frame_post_draw
	var output := "user://office-props-review.png"
	var args := OS.get_cmdline_user_args()
	if not args.is_empty():
		output = args[0]
	var image := root.get_texture().get_image()
	var result := image.save_png(output)
	print("Native asset review capture: ", output, " (", result, ")")
	quit(0 if result == OK else 1)
