extends Node3D
## Native office props: grounded origins, separable moving parts, no game authority.
## Surface aging only reflects incoming simulation state; it never advances time.

const SUPPORTED_KINDS := [
	"desk", "telephone", "pay_phone", "desk_lamp", "trash_can", "fire_extinguisher",
	"temple_tree", "reflection_screen", "meditation_cushion", "temple_audio_control",
	"chapel_pew", "chapel_altar", "library_shelf", "reading_table", "museum_case",
]
var finish: StandardMaterial3D
var surface_base := Color("#35574a")
var dust_marks: Array[MeshInstance3D] = []
var repair_seam: MeshInstance3D


static func create(kind: String, reception := false) -> Node3D:
	var prop := new()
	prop._build(kind, reception)
	return prop


func _finish(color: String, metal := 0.0) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = Color(color)
	material.metallic = metal
	material.roughness = 0.68 if metal == 0.0 else 0.38
	return material


func _build(kind: String, reception: bool) -> void:
	var wood := _finish("#78523b")
	var edge := _finish("#b28a59")
	var brass := _finish("#ad884e", 0.55)
	var charcoal := _finish("#242b28")
	var cream := _finish("#dfd1af")
	finish = _finish("#35574a")
	match kind:
		"desk":
			if reception:
				_reception(wood, edge, brass, cream)
			else:
				_desk(wood, edge, brass, charcoal)
		"telephone", "pay_phone":
			_phone(kind == "pay_phone", brass, charcoal, cream)
		"desk_lamp":
			_lamp(brass, charcoal, cream)
		"trash_can":
			_trash_can(brass, charcoal)
		"fire_extinguisher":
			_fire_extinguisher(brass, charcoal)
		"temple_tree":
			_temple_tree(wood, brass)
		"reflection_screen":
			_reflection_screen(wood, brass)
		"meditation_cushion":
			_meditation_cushion(wood, brass)
		"temple_audio_control":
			_temple_audio_control(brass, cream, charcoal)
		"chapel_pew":
			_chapel_pew(wood, brass)
		"chapel_altar":
			_chapel_altar(wood, brass, cream)
		"library_shelf":
			_library_shelf(wood, brass)
		"reading_table":
			_reading_table(wood, brass, cream)
		"museum_case":
			_museum_case(wood, brass, cream)
	set_surface_state(100, 100)


func _box(part: String, at: Vector3, size: Vector3, material: Material, parent: Node3D = self) -> MeshInstance3D:
	var mesh := BoxMesh.new()
	mesh.size = size
	mesh.material = material
	return _mesh(part, at, mesh, parent)


func _cylinder(part: String, at: Vector3, radius: float, height: float, material: Material, parent: Node3D = self) -> MeshInstance3D:
	var mesh := CylinderMesh.new()
	mesh.top_radius = radius
	mesh.bottom_radius = radius
	mesh.height = height
	mesh.radial_segments = 16
	mesh.material = material
	return _mesh(part, at, mesh, parent)


func _mesh(part: String, at: Vector3, mesh: Mesh, parent: Node3D) -> MeshInstance3D:
	var instance := MeshInstance3D.new()
	instance.name = part
	instance.mesh = mesh
	instance.position = at
	parent.add_child(instance)
	return instance


func _pivot(part: String, at: Vector3) -> Node3D:
	var pivot := Node3D.new()
	pivot.name = part
	pivot.position = at
	add_child(pivot)
	return pivot


func _desk(wood: Material, edge: Material, brass: Material, dark: Material) -> void:
	_box("Desktop", Vector3(0, 0.79, 0), Vector3(3.0, 0.12, 1.5), wood)
	_box("FrontInlay", Vector3(0, 0.78, 0.757), Vector3(2.96, 0.025, 0.018), brass)
	for side in [-1.0, 1.0]:
		for depth in [-0.57, 0.57]:
			_box("Leg", Vector3(side * 1.30, 0.36, depth), Vector3(0.09, 0.72, 0.09), dark)
			_cylinder("BrassFoot", Vector3(side * 1.30, 0.045, depth), 0.065, 0.09, brass)
	_box("RearBrace", Vector3(0, 0.30, -0.60), Vector3(2.6, 0.07, 0.07), dark)
	_box("DrawerCabinet", Vector3(0.98, 0.57, 0.04), Vector3(0.54, 0.31, 1.12), finish)
	var drawer := _pivot("DrawerPivot", Vector3(0.98, 0.57, 0.60))
	_box("DrawerFront", Vector3.ZERO, Vector3(0.56, 0.29, 0.055), edge, drawer)
	_box("DrawerHandle", Vector3(0, 0.035, 0.05), Vector3(0.20, 0.03, 0.035), brass, drawer)
	_box("WritingMat", Vector3(-0.22, 0.854, 0.08), Vector3(1.38, 0.008, 0.70), finish)
	_wear_detail(Vector3(-0.38, 0.861, 0.25), Vector3(0.16, 0.003, 0.025), edge)


func _reception(wood: Material, edge: Material, brass: Material, cream: Material) -> void:
	_box("CounterBody", Vector3(0, 0.48, 0), Vector3(3.6, 0.96, 0.72), finish)
	_box("Countertop", Vector3(0, 1.0, 0.08), Vector3(3.9, 0.14, 1.05), wood)
	_box("CounterRim", Vector3(0, 1.015, 0.616), Vector3(3.88, 0.025, 0.018), brass)
	_box("Kickplate", Vector3(0, 0.08, 0.367), Vector3(3.50, 0.12, 0.025), brass)
	for slat in range(18):
		_box("TimberSlat", Vector3(-1.68 + slat * 0.197, 0.51, 0.377), Vector3(0.065, 0.67, 0.036), edge)
	_box("PaperTray", Vector3(1.20, 1.10, 0.06), Vector3(0.47, 0.04, 0.32), brass)
	_box("Paper", Vector3(1.20, 1.13, 0.06), Vector3(0.39, 0.018, 0.25), cream)
	_cylinder("BellBase", Vector3(-1.27, 1.11, 0.17), 0.105, 0.045, brass)
	_cylinder("BellCap", Vector3(-1.27, 1.16, 0.17), 0.065, 0.06, brass)
	_wear_detail(Vector3(0.38, 1.073, 0.39), Vector3(0.22, 0.003, 0.03), edge)


func _phone(wall_mounted: bool, brass: Material, dark: Material, cream: Material) -> void:
	var base_y := 0.89
	if wall_mounted:
		base_y = 1.19
		_box("PhonePedestal", Vector3(0, 0.52, 0), Vector3(0.58, 1.04, 0.42), finish)
		_box("CoinSlot", Vector3(0.17, 0.85, 0.219), Vector3(0.13, 0.025, 0.018), brass)
	_box("TelephoneBase", Vector3(0, base_y, 0), Vector3(0.55, 0.16, 0.42), finish)
	_cylinder("DialRim", Vector3(0, base_y + 0.09, 0.04), 0.13, 0.025, brass)
	var dial := _pivot("DialPivot", Vector3(0, base_y + 0.11, 0.04))
	_cylinder("DialFace", Vector3.ZERO, 0.103, 0.018, cream, dial)
	for hole in range(10):
		var angle := float(hole) * TAU / 10.0
		_cylinder("DialFingerHole", Vector3(cos(angle) * 0.077, 0.011, sin(angle) * 0.077), 0.014, 0.006, dark, dial)
	var handset := _pivot("HandsetPivot", Vector3(0, base_y + 0.21, -0.12))
	_box("ReceiverBridge", Vector3.ZERO, Vector3(0.40, 0.075, 0.09), dark, handset)
	for side in [-1.0, 1.0]:
		_cylinder("ReceiverCup", Vector3(side * 0.215, -0.024, 0), 0.068, 0.11, dark, handset)
		_cylinder("ReceiverTrim", Vector3(side * 0.215, -0.078, 0), 0.069, 0.009, brass, handset)
	for coil in range(12):
		var cord := _cylinder("CordLoop", Vector3(-0.30, base_y - 0.045 - coil * 0.012, -0.10), 0.021, 0.007, dark)
		cord.rotation.x = 0.22
	_wear_detail(Vector3(0.17, base_y + 0.084, 0.12), Vector3(0.075, 0.003, 0.014), brass)


func _lamp(brass: Material, dark: Material, cream: Material) -> void:
	_cylinder("LampFoot", Vector3(0, 0.855, 0), 0.18, 0.04, finish)
	_cylinder("Stem", Vector3(0, 1.04, 0), 0.027, 0.34, brass)
	var hinge := _pivot("ShadePivot", Vector3(0, 1.24, 0))
	hinge.rotation.z = -0.18
	_cylinder("ShadeHinge", Vector3.ZERO, 0.05, 0.04, brass, hinge)
	var shade_mesh := CylinderMesh.new()
	shade_mesh.top_radius = 0.065
	shade_mesh.bottom_radius = 0.19
	shade_mesh.height = 0.16
	shade_mesh.radial_segments = 20
	shade_mesh.material = finish
	_mesh("EnamelShade", Vector3(0.08, 0.0, 0), shade_mesh, hinge)
	var glow := cream.duplicate() as StandardMaterial3D
	glow.emission_enabled = true
	glow.emission = Color("#ffda9e")
	glow.emission_energy_multiplier = 0.5
	_cylinder("ShadeLiner", Vector3(0.08, -0.084, 0), 0.17, 0.008, glow, hinge)
	_cylinder("Switch", Vector3(0.10, 0.885, 0), 0.019, 0.028, dark)
	var light := OmniLight3D.new()
	light.name = "TaskLight"
	light.position = Vector3(0.08, 1.12, 0)
	light.light_color = Color("#ffd095")
	light.light_energy = 0.22
	light.omni_range = 2.4
	light.shadow_enabled = false
	add_child(light)
	_wear_detail(Vector3(0.08, 0.878, 0.10), Vector3(0.08, 0.003, 0.012), brass)


func _trash_can(brass: Material, dark: Material) -> void:
	var enamel := _finish("#40574e")
	finish = enamel
	surface_base = Color("#40574e")
	_cylinder("TrashCanFoot", Vector3(0, 0.07, 0), 0.255, 0.08, dark)
	_cylinder("TrashCanBody", Vector3(0, 0.40, 0), 0.29, 0.62, enamel)
	_cylinder("TrashCanRim", Vector3(0, 0.73, 0), 0.305, 0.055, brass)
	_cylinder("TrashCanLid", Vector3(0, 0.78, 0), 0.30, 0.045, dark)
	_cylinder("TrashCanOpening", Vector3(0, 0.806, 0), 0.145, 0.008, _finish("#161f1b"))
	_box("TrashCanHighlight", Vector3(0.0, 0.42, 0.286), Vector3(0.035, 0.40, 0.012), brass)
	_box("TrashCanPedal", Vector3(0.31, 0.07, 0.02), Vector3(0.16, 0.04, 0.11), brass)
	_wear_detail(Vector3(0.0, 0.42, 0.295), Vector3(0.12, 0.003, 0.008), brass)


func _fire_extinguisher(brass: Material, dark: Material) -> void:
	finish = _finish("#b83b32")
	surface_base = Color("#b83b32")
	_cylinder("Cylinder", Vector3(0, 0.56, 0), 0.15, 0.66, finish)
	_cylinder("TopShoulder", Vector3(0, 0.91, 0), 0.12, 0.10, brass)
	_box("Valve", Vector3(0, 1.02, 0), Vector3(0.16, 0.06, 0.10), dark)
	_box("Handle", Vector3(0.10, 1.08, 0), Vector3(0.16, 0.035, 0.035), dark)
	_box("SafetyPin", Vector3(-0.08, 1.08, 0), Vector3(0.06, 0.10, 0.025), brass)
	_box("Label", Vector3(0, 0.60, 0.151), Vector3(0.12, 0.20, 0.008), _finish("#e7dfc6"))
	_box("Hose", Vector3(0.20, 0.74, 0.02), Vector3(0.045, 0.42, 0.045), dark)


func _temple_tree(wood: Material, brass: Material) -> void:
	finish = _finish("#566f55")
	_cylinder("Planter", Vector3(0, 0.22, 0), 0.58, 0.42, wood)
	_cylinder("Soil", Vector3(0, 0.44, 0), 0.49, 0.035, _finish("#403d2e"))
	_cylinder("Trunk", Vector3(0, 1.22, 0), 0.14, 1.55, brass)
	for index in range(5):
		var canopy := SphereMesh.new()
		canopy.radius = 0.72 if index == 0 else 0.52
		canopy.height = canopy.radius * 2.0
		canopy.material = finish
		var at := Vector3.ZERO if index == 0 else Vector3(
			cos(float(index) * TAU / 4.0) * 0.48,
			0.0 if index < 3 else 0.38,
			sin(float(index) * TAU / 4.0) * 0.48,
		)
		_mesh("Canopy", Vector3(at.x, 2.35 + at.y, at.z), canopy, self)


func _reflection_screen(wood: Material, brass: Material) -> void:
	finish = _finish("#62766a")
	_box("ScreenPanel", Vector3(0, 1.05, 0), Vector3(4.0, 1.85, 0.12), finish)
	_box("LowerFrame", Vector3(0, 0.15, 0), Vector3(4.08, 0.12, 0.16), wood)
	for side in [-1.0, 1.0]:
		_box("ScreenPost", Vector3(side * 1.94, 1.05, 0), Vector3(0.12, 2.0, 0.18), wood)
		_box("ScreenFoot", Vector3(side * 1.94, 0.06, 0), Vector3(0.50, 0.10, 0.38), brass)


func _meditation_cushion(wood: Material, brass: Material) -> void:
	finish = _finish("#887b69")
	_cylinder("CushionBase", Vector3(0, 0.16, 0), 0.57, 0.28, finish)
	_cylinder("CushionTop", Vector3(0, 0.31, 0), 0.52, 0.08, brass)
	_wear_detail(Vector3(0, 0.36, 0.30), Vector3(0.18, 0.004, 0.02), wood)


func _temple_audio_control(brass: Material, cream: Material, dark: Material) -> void:
	finish = _finish("#40574e")
	_box("WallPlaque", Vector3(0, 1.3, 0), Vector3(1.1, 0.62, 0.12), finish)
	_box("PlaqueInset", Vector3(0, 1.32, 0.071), Vector3(0.91, 0.43, 0.02), cream)
	_box("MusicSwitch", Vector3(-0.22, 1.30, 0.093), Vector3(0.18, 0.12, 0.03), brass)
	_box("SilenceSwitch", Vector3(0.22, 1.30, 0.093), Vector3(0.18, 0.12, 0.03), dark)


func _chapel_pew(wood: Material, brass: Material) -> void:
	finish = wood
	_box("Seat", Vector3(0, 0.50, 0), Vector3(2.4, 0.12, 0.60), finish)
	_box("Back", Vector3(0, 0.95, -0.24), Vector3(2.4, 0.78, 0.13), finish)
	for side in [-1.0, 1.0]:
		_box("Support", Vector3(side * 1.08, 0.27, 0), Vector3(0.12, 0.50, 0.48), brass)
		_box("EndCap", Vector3(side * 1.20, 0.72, 0.02), Vector3(0.16, 0.38, 0.54), wood)


func _chapel_altar(wood: Material, brass: Material, cream: Material) -> void:
	finish = wood
	_box("AltarBase", Vector3(0, 0.48, 0), Vector3(2.8, 0.88, 1.2), finish)
	_box("AltarTop", Vector3(0, 0.96, 0), Vector3(3.1, 0.12, 1.4), brass)
	_box("AltarCloth", Vector3(0, 0.89, 0.62), Vector3(2.5, 0.18, 0.025), cream)


func _library_shelf(wood: Material, brass: Material) -> void:
	finish = wood
	_box("BookcaseBack", Vector3(0, 1.1, -0.10), Vector3(2.4, 2.2, 0.18), finish)
	for shelf in range(4):
		var y := 0.35 + float(shelf) * 0.52
		_box("Shelf", Vector3(0, y, 0.04), Vector3(2.5, 0.08, 0.48), brass)
		for book in range(7):
			var height := 0.26 + float((book + shelf) % 3) * 0.07
			var cover := _finish(["#72816a", "#9b6d58", "#526f7c"][(book + shelf) % 3])
			_box(
				"Book",
				Vector3(-1.0 + float(book) * 0.32, y + 0.04 + height / 2.0, 0.06),
				Vector3(0.20, height, 0.30),
				cover,
			)


func _reading_table(wood: Material, brass: Material, cream: Material) -> void:
	finish = wood
	_cylinder("TableTop", Vector3(0, 0.78, 0), 0.82, 0.12, finish)
	_cylinder("TableBase", Vector3(0, 0.38, 0), 0.12, 0.68, brass)
	_cylinder("TableFoot", Vector3(0, 0.06, 0), 0.48, 0.10, brass)
	_box("OpenBook", Vector3(0.16, 0.86, 0), Vector3(0.48, 0.02, 0.34), cream)


func _museum_case(wood: Material, brass: Material, cream: Material) -> void:
	finish = _finish("#8b7659")
	_box("DisplayBase", Vector3(0, 0.32, 0), Vector3(1.6, 0.54, 0.85), wood)
	_box("GlassTop", Vector3(0, 0.90, 0), Vector3(1.52, 0.62, 0.77), _finish("#a9c6b8"))
	_box("DisplayArtifact", Vector3(0, 0.74, 0), Vector3(0.34, 0.20, 0.28), cream)
	_box("BrassEdge", Vector3(0, 0.60, 0.43), Vector3(1.62, 0.06, 0.04), brass)


func _wear_detail(at: Vector3, size: Vector3, material: Material) -> void:
	repair_seam = _box("WearSeam", at, size, material)
	var dirt := _finish("#89775d")
	for index in range(3):
		var mark := _box("DustMark", at + Vector3(index * 0.035, 0.001, -0.05), Vector3(0.025, 0.003, 0.008), dirt)
		mark.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		dust_marks.append(mark)


func set_surface_state(condition: int, cleanliness: int) -> void:
	# Continuous, mild changes: no instant neon/cyberpunk swap or artificial decay.
	var wear := 1.0 - clampf(float(condition) / 100.0, 0.0, 1.0)
	finish.albedo_color = surface_base.lerp(Color("#5e5c4c"), wear * 0.35)
	finish.roughness = 0.68 + wear * 0.22
	if repair_seam != null:
		repair_seam.scale.x = maxf(0.001, wear)
		repair_seam.visible = condition < 100
	var dirt_amount := 1.0 - clampf(float(cleanliness) / 100.0, 0.0, 1.0)
	for mark in dust_marks:
		mark.scale.x = maxf(0.001, dirt_amount)
		mark.visible = cleanliness < 100
