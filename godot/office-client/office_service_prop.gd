extends "res://office_prop.gd"
## Shared finish/pivot/wear conventions from the approved office prop family.
## Service models do not initiate purchases, cash withdrawals, or interactions.

const SERVICE_KINDS := ["chair", "atm", "vending_machine"]


static func create_service(kind: String) -> Node3D:
	var prop := new()
	prop._build_service(kind)
	return prop


func _build_service(kind: String) -> void:
	var wood := _finish("#78523b")
	var brass := _finish("#ad884e", 0.55)
	var dark := _finish("#242b28")
	var cream := _finish("#dfd1af")
	finish = _finish("#35574a")
	match kind:
		"chair":
			_chair(wood, brass, dark)
		"atm":
			_atm(brass, dark, cream)
		"vending_machine":
			_vending(brass, dark, cream)
	set_surface_state(100, 100)


func _chair(wood: Material, brass: Material, dark: Material) -> void:
	for side in [-1.0, 1.0]:
		for depth in [-0.23, 0.23]:
			_box("ChairLeg", Vector3(side * 0.24, 0.22, depth), Vector3(0.055, 0.44, 0.055), wood)
			_cylinder("ChairFoot", Vector3(side * 0.24, 0.026, depth), 0.036, 0.052, brass)
	_box("SeatFrame", Vector3(0, 0.43, 0), Vector3(0.59, 0.07, 0.58), wood)
	var seat := _pivot("SeatPivot", Vector3(0, 0.50, 0))
	_box("SeatCushion", Vector3.ZERO, Vector3(0.54, 0.10, 0.53), finish, seat)
	_box("SeatPiping", Vector3(0, -0.023, -0.268), Vector3(0.50, 0.01, 0.007), brass, seat)
	var back := _pivot("BackrestPivot", Vector3(0, 0.54, 0.23))
	back.rotation.x = 0.08
	_box("BackFrame", Vector3(0, 0.23, 0.025), Vector3(0.59, 0.48, 0.07), wood, back)
	_box("BackCushion", Vector3(0, 0.23, -0.028), Vector3(0.51, 0.39, 0.06), finish, back)
	for side in [-1.0, 1.0]:
		_box("ArmSupport", Vector3(side * 0.31, 0.56, 0.17), Vector3(0.035, 0.26, 0.035), dark)
		_box("WoodenArm", Vector3(side * 0.31, 0.70, 0), Vector3(0.075, 0.055, 0.49), wood)
	_wear_detail(Vector3(-0.16, 0.551, -0.10), Vector3(0.12, 0.003, 0.018), brass)


func _cabinet(width: float, height: float, depth: float, brass: Material, cream: Material) -> void:
	_box("Cabinet", Vector3(0, height / 2.0, 0), Vector3(width, height, depth), finish)
	_box("CreamFascia", Vector3(0, height * 0.60, depth / 2.0 + 0.012), Vector3(width - 0.09, height * 0.70, 0.025), cream)
	_box("Plinth", Vector3(0, 0.075, 0), Vector3(width + 0.035, 0.15, depth + 0.025), brass)
	for side in [-1.0, 1.0]:
		_box("BrassEdge", Vector3(side * (width / 2.0 - 0.025), height / 2.0, depth / 2.0 + 0.029), Vector3(0.015, height - 0.15, 0.015), brass)


func _atm(brass: Material, dark: Material, cream: Material) -> void:
	_cabinet(0.72, 1.24, 0.56, brass, cream)
	_box("ScreenBezel", Vector3(0, 1.00, 0.31), Vector3(0.47, 0.32, 0.04), dark)
	var screen := _finish("#6c8068")
	screen.emission_enabled = true
	screen.emission = Color("#53604b")
	screen.emission_energy_multiplier = 0.20
	_box("Screen", Vector3(0, 1.00, 0.334), Vector3(0.39, 0.24, 0.012), screen)
	var keypad := _pivot("KeypadPivot", Vector3(0.13, 0.72, 0.322))
	_box("KeypadPlate", Vector3.ZERO, Vector3(0.19, 0.17, 0.018), brass, keypad)
	for row in range(4):
		for column in range(3):
			_box("Key", Vector3(-0.052 + column * 0.052, 0.055 - row * 0.037, 0.014), Vector3(0.033, 0.022, 0.016), dark, keypad)
	_box("CardSlot", Vector3(-0.16, 0.74, 0.325), Vector3(0.15, 0.027, 0.02), dark)
	var cover := _pivot("ServiceCoverPivot", Vector3(0, 0.43, 0.321))
	_box("ServiceSlot", Vector3.ZERO, Vector3(0.29, 0.055, 0.022), dark, cover)
	_box("SlotLip", Vector3(0, -0.035, 0.025), Vector3(0.29, 0.012, 0.045), brass, cover)
	for vent in range(5):
		_box("LowerVent", Vector3(-0.12 + vent * 0.06, 0.24, 0.286), Vector3(0.025, 0.055, 0.012), dark)
	_wear_detail(Vector3(0.30, 0.57, 0.322), Vector3(0.006, 0.13, 0.003), brass)


func _vending(brass: Material, dark: Material, cream: Material) -> void:
	_cabinet(0.92, 1.88, 0.62, brass, cream)
	_box("DisplayRecess", Vector3(-0.10, 1.11, 0.34), Vector3(0.57, 1.13, 0.025), dark)
	for row in range(3):
		var shelf_y := 1.49 - row * 0.32
		_box("Shelf", Vector3(-0.10, shelf_y - 0.10, 0.36), Vector3(0.53, 0.018, 0.08), brass)
		for column in range(3):
			var can_x := -0.27 + column * 0.17
			_cylinder("StockSilhouette", Vector3(can_x, shelf_y, 0.367), 0.035, 0.14, cream if row % 2 == 0 else finish)
			_cylinder("StockCap", Vector3(can_x, shelf_y + 0.073, 0.367), 0.036, 0.006, brass)
	var glass := _finish("#b5c2a0")
	glass.albedo_color.a = 0.16
	glass.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	var display := _box("DisplayGlass", Vector3(-0.10, 1.11, 0.41), Vector3(0.57, 1.13, 0.012), glass)
	display.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_box("ControlPlate", Vector3(0.32, 1.12, 0.338), Vector3(0.13, 0.58, 0.022), finish)
	for button in range(3):
		var knob := _cylinder("SelectionButton", Vector3(0.32, 1.30 - button * 0.14, 0.36), 0.028, 0.025, brass)
		knob.rotation.x = PI / 2.0
	_box("PaymentSlot", Vector3(0.32, 0.72, 0.338), Vector3(0.08, 0.019, 0.025), dark)
	var hatch := _pivot("PickupHatchPivot", Vector3(-0.05, 0.35, 0.338))
	_box("PickupRecess", Vector3.ZERO, Vector3(0.48, 0.17, 0.025), dark, hatch)
	_box("PickupLip", Vector3(0, -0.085, 0.025), Vector3(0.48, 0.015, 0.05), brass, hatch)
	_wear_detail(Vector3(0.40, 0.58, 0.338), Vector3(0.006, 0.18, 0.003), brass)
