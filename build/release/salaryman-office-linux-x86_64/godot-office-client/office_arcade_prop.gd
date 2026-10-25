extends Node3D
## Native recreation-hall cabinet art; Python owns all arcade interactions.

var attract_clock := 0.0


static func create(object_id: String, title: String) -> Node3D:
	var cabinet := new()
	cabinet.name = object_id
	cabinet._build(title, _accent_for_id(object_id))
	return cabinet


static func _accent_for_id(object_id: String) -> Color:
	match object_id:
		"arcade-cyber-serpent":
			return Color("#69d49a")
		"arcade-void-invaders":
			return Color("#a882e8")
		"arcade-barrel-runner":
			return Color("#e9a35b")
		"arcade-neon-breaker":
			return Color("#64cbd2")
		_:
			return Color("#9abb83")


static func _ascii_game_art(object_id: String) -> String:
	match object_id:
		"arcade-cyber-serpent":
			return "~<>~\n  oo"
		"arcade-void-invaders":
			return "* [] *\n  ||"
		"arcade-barrel-runner":
			return "(O)\n ||"
		"arcade-neon-breaker":
			return "<+>\n|_|"
		_:
			return "+--+\n|::|"


func _material(color: Color, roughness := 0.72, emission := false) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = roughness
	if emission:
		material.emission_enabled = true
		material.emission = color
		material.emission_energy_multiplier = 0.72
	return material


func _box(part: String, at: Vector3, size: Vector3, material: Material) -> MeshInstance3D:
	var mesh := BoxMesh.new()
	mesh.size = size
	mesh.material = material
	var instance := MeshInstance3D.new()
	instance.name = part
	instance.mesh = mesh
	instance.position = at
	add_child(instance)
	return instance


func _cylinder(part: String, at: Vector3, radius: float, height: float, material: Material) -> MeshInstance3D:
	var mesh := CylinderMesh.new()
	mesh.top_radius = radius
	mesh.bottom_radius = radius
	mesh.height = height
	mesh.radial_segments = 12
	mesh.material = material
	var instance := MeshInstance3D.new()
	instance.name = part
	instance.mesh = mesh
	instance.position = at
	add_child(instance)
	return instance


func _sphere(part: String, at: Vector3, radius: float, material: Material) -> MeshInstance3D:
	var mesh := SphereMesh.new()
	mesh.radius = radius
	mesh.height = radius * 2.0
	mesh.radial_segments = 12
	mesh.rings = 6
	mesh.material = material
	var instance := MeshInstance3D.new()
	instance.name = part
	instance.mesh = mesh
	instance.position = at
	add_child(instance)
	return instance


func _process(delta: float) -> void:
	update_attract_mode(delta)


func update_attract_mode(delta: float) -> void:
	attract_clock = fposmod(attract_clock + delta, TAU)
	var main_sprite := get_node_or_null("ScreenSpriteMain") as MeshInstance3D
	var left_sprite := get_node_or_null("ScreenSpriteLeft") as MeshInstance3D
	var right_sprite := get_node_or_null("ScreenSpriteRight") as MeshInstance3D
	if main_sprite != null:
		main_sprite.position.x = -0.06 + sin(attract_clock) * 0.09
		main_sprite.rotation.z = sin(attract_clock * 0.7) * 0.10
	if left_sprite != null:
		left_sprite.position.y = 1.12 + sin(attract_clock * 1.4) * 0.055
	if right_sprite != null:
		right_sprite.position.y = 1.31 + cos(attract_clock * 1.1) * 0.055


func _build(title: String, accent_color: Color) -> void:
	var cabinet_material := _material(Color("#34403b"))
	var side_material := _material(Color("#665343"))
	var dark_material := _material(Color("#202623"))
	var brass_material := _material(Color("#b08b53"), 0.42)
	var accent_material := _material(accent_color, 0.55)
	var screen_material := _material(accent_color.darkened(0.32), 0.28, true)
	var button_material := _material(Color("#d8c9a8"), 0.42)

	_box("CabinetBody", Vector3(0.0, 0.88, 0.0), Vector3(0.82, 1.72, 0.62), cabinet_material)
	_box("LeftWoodSide", Vector3(-0.405, 0.90, 0.0), Vector3(0.045, 1.55, 0.64), side_material)
	_box("RightWoodSide", Vector3(0.405, 0.90, 0.0), Vector3(0.045, 1.55, 0.64), side_material)
	_box("FrontAccent", Vector3(0.0, 0.18, 0.325), Vector3(0.68, 0.12, 0.035), brass_material)
	_box("CabinetFoot", Vector3(0.0, 0.07, 0.0), Vector3(0.72, 0.14, 0.58), dark_material)

	_box("MarqueeHousing", Vector3(0.0, 1.68, 0.045), Vector3(0.78, 0.30, 0.68), dark_material)
	_box("MarqueeFace", Vector3(0.0, 1.68, 0.397), Vector3(0.68, 0.20, 0.025), accent_material)
	var marquee := Label3D.new()
	marquee.name = "GameTitle"
	marquee.text = title
	marquee.font_size = 18
	marquee.pixel_size = 0.006
	marquee.modulate = Color("#f5ecd5")
	marquee.outline_size = 4
	marquee.outline_modulate = Color("#1d2824")
	marquee.position = Vector3(0.0, 1.68, 0.416)
	marquee.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	add_child(marquee)

	_box("ScreenFrame", Vector3(0.0, 1.22, 0.327), Vector3(0.64, 0.56, 0.08), brass_material)
	_box("ScreenGlass", Vector3(0.0, 1.22, 0.371), Vector3(0.54, 0.43, 0.018), dark_material)
	_box("ScreenField", Vector3(0.0, 1.22, 0.383), Vector3(0.48, 0.36, 0.008), screen_material)
	# Simple game-color shapes evoke active hardware without scanlines or a screen filter.
	_box("ScreenSpriteMain", Vector3(-0.06, 1.22, 0.391), Vector3(0.12, 0.075, 0.009), accent_material)
	_box("ScreenSpriteLeft", Vector3(-0.17, 1.12, 0.391), Vector3(0.055, 0.045, 0.009), button_material)
	_box("ScreenSpriteRight", Vector3(0.17, 1.31, 0.391), Vector3(0.055, 0.045, 0.009), button_material)
	var ascii_screen_art := Label3D.new()
	ascii_screen_art.name = "ScreenAsciiArt"
	ascii_screen_art.text = _ascii_game_art(name)
	ascii_screen_art.font_size = 12
	ascii_screen_art.pixel_size = 0.008
	ascii_screen_art.modulate = Color("#f1e4c4")
	ascii_screen_art.outline_size = 2
	ascii_screen_art.outline_modulate = Color("#17221c")
	ascii_screen_art.position = Vector3(0.0, 1.22, 0.405)
	ascii_screen_art.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	add_child(ascii_screen_art)

	_box("ControlPanel", Vector3(0.0, 0.79, 0.35), Vector3(0.68, 0.13, 0.34), dark_material)
	_cylinder("JoystickBase", Vector3(-0.18, 0.875, 0.39), 0.07, 0.035, brass_material)
	_cylinder("JoystickStem", Vector3(-0.18, 0.94, 0.39), 0.025, 0.12, button_material)
	_sphere("JoystickKnob", Vector3(-0.18, 1.005, 0.39), 0.055, accent_material)
	for index in range(3):
		_cylinder(
			"ActionButton%d" % index,
			Vector3(0.05 + float(index) * 0.12, 0.875, 0.42),
			0.045,
			0.035,
			accent_material if index == 1 else button_material,
		)
	_box("CoinDoor", Vector3(0.0, 0.48, 0.326), Vector3(0.30, 0.24, 0.035), brass_material)
	_box("CoinSlot", Vector3(0.0, 0.51, 0.348), Vector3(0.11, 0.018, 0.008), dark_material)
