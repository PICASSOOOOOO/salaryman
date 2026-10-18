extends SceneTree

const Prop = preload("res://office_prop.gd")
const Service = preload("res://office_service_prop.gd")
const Client = preload("res://main.gd")
const ArcadeProp = preload("res://office_arcade_prop.gd")
var failures := 0


func _initialize() -> void:
	call_deferred("_run")


func check(value: bool, message: String) -> void:
	if not value:
		failures += 1
		push_error(message)


func _run() -> void:
	for kind in Prop.SUPPORTED_KINDS:
		var prop := Prop.create(kind)
		check(prop.get_child_count() > 3, kind + " must have native model parts")
		check(prop.position == Vector3.ZERO, kind + " must use a grounded local origin")
		prop.set_surface_state(25, 20)
		check(prop.repair_seam.visible, kind + " must reflect existing condition")
		check(prop.dust_marks[0].visible, kind + " must reflect existing cleanliness")
		check(is_equal_approx(prop.repair_seam.scale.x, 0.75), "Wear must vary continuously")
		prop.set_surface_state(100, 100)
		check(not prop.repair_seam.visible and not prop.dust_marks[0].visible, "Cleaning/repair must restore visuals")
		prop.set_surface_state(-10, 200)
		check(is_equal_approx(prop.repair_seam.scale.x, 1.0), "Invalid condition must clamp")
		check(not prop.dust_marks[0].visible, "Invalid cleanliness must clamp")
		prop.free()
	var phone := Prop.create("telephone")
	check(phone.has_node("HandsetPivot") and phone.has_node("DialPivot"), "Telephone must have separable animation pivots")
	phone.free()
	var lamp := Prop.create("desk_lamp")
	check(lamp.has_node("ShadePivot") and lamp.has_node("TaskLight"), "Lamp must have an articulated shade and native light")
	lamp.free()
	for kind in Service.SERVICE_KINDS:
		var service := Service.create_service(kind)
		check(service is Prop, "Service models must reuse the same surface-state contract")
		check(service.get_child_count() > 6, kind + " must have authored parts")
		service.set_surface_state(40, 30)
		check(service.repair_seam.visible and service.dust_marks[0].visible, kind + " must show authoritative wear")
		service.set_surface_state(100, 100)
		check(not service.repair_seam.visible, kind + " must reflect repairs")
		service.free()
	var chair := Service.create_service("chair")
	check(chair.has_node("SeatPivot") and chair.has_node("BackrestPivot"), "Chair must have animation-ready pivots")
	chair.free()
	var vending := Service.create_service("vending_machine")
	check(vending.has_node("PickupHatchPivot"), "Vending hatch must remain independently animatable")
	vending.free()
	var arcade_ids := [
		"arcade-cyber-serpent",
		"arcade-void-invaders",
		"arcade-barrel-runner",
		"arcade-neon-breaker",
	]
	var arcade_accents := {}
	for arcade_id in arcade_ids:
		var arcade := ArcadeProp.create(arcade_id, arcade_id.trim_prefix("arcade-").replace("-", " ").to_upper())
		check(arcade.has_node("CabinetBody"), "Arcade must have a full cabinet")
		check(arcade.has_node("GameTitle"), "Arcade must show its game title")
		check(arcade.has_node("ScreenField"), "Arcade must have a distinct screen")
		check(arcade.has_node("JoystickKnob"), "Arcade must have player controls")
		check(arcade.get_node("GameTitle").text != "", "Arcade title cannot be blank")
		check(arcade.has_node("ScreenAsciiArt"), "Arcade screens should use distinct ASCII art")
		arcade_accents[arcade.get_node("MarqueeFace").mesh.material.albedo_color] = true
		var sprite := arcade.get_node("ScreenSpriteMain") as MeshInstance3D
		var initial_sprite_position := sprite.position
		arcade.update_attract_mode(0.4)
		check(sprite.position != initial_sprite_position, "Arcade screen should animate in attract mode")
		arcade.free()
	check(arcade_accents.size() == 4, "Each approved arcade must have a distinct cabinet accent")
	check(Client.museum_case_variant("floor-12-interior-prop-12") == 0, "First museum case must select exhibit one")
	check(Client.museum_case_variant("floor-12-interior-prop-13") == 1, "Second museum case must select exhibit two")
	check(Client.museum_case_variant("floor-12-interior-prop-14") == 2, "Third museum case must select exhibit three")
	var medallion_case := Prop.create("museum_case", false, 0)
	var crystal_case := Prop.create("museum_case", false, 1)
	var tower_case := Prop.create("museum_case", false, 2)
	check(medallion_case.has_node("DisplayArtifactMedallion"), "First exhibit must show the medallion")
	check(crystal_case.has_node("DisplayArtifactCrystal"), "Second exhibit must show the crystal")
	check(tower_case.has_node("DisplayArtifactTower0"), "Third exhibit must show the miniature tower")
	medallion_case.free()
	crystal_case.free()
	tower_case.free()

	var client := Client.new()
	client._build_materials()
	client.dynamic_root = Node3D.new()
	client.add_child(client.dynamic_root)
	var arcade_from_bridge := client._build_bridge_object(
		"arcade",
		Vector3(2.0, 0.0, 3.0),
		"arcade-cyber-serpent",
		"CYBER SERPENT",
	)
	check(arcade_from_bridge.get_node("GameTitle").text == "CYBER SERPENT", "Bridge title reaches cabinet marquee")
	check(arcade_from_bridge.position == Vector3(2.0, 0.0, 3.0), "Arcade cabinet keeps bridge position")
	var terminal := client._build_bridge_object(
		"crt_terminal",
		Vector3.ZERO,
		"terminal-art-test",
	)
	check(terminal != null, "CRT terminal keeps its physical monitor model")
	check(
		client.dynamic_root.has_node("terminal-art-test-screen-scanline-00"),
		"CRT scanlines are attached to terminal displays",
	)
	var tv := client._build_bridge_object("tv", Vector3(3.0, 0.0, 0.0), "tv-art-test")
	check(tv.name == "tv-art-test", "TVs use a distinct native model")
	check(
		client.dynamic_root.has_node("tv-art-test-screen-scanline-00"),
		"CRT scanlines are attached to TV displays",
	)
	check(
		not arcade_from_bridge.get_node("ScreenAsciiArt").text.is_empty(),
		"Arcade display art remains ASCII",
	)
	check(
		arcade_from_bridge.get_node_or_null("ScreenScanline") == null,
		"Arcade screens must not receive CRT scanline overlays",
	)
	var objects := [
		{"id": "office1-desk", "kind": "desk", "x": 1800, "y": 6250, "condition": 85, "cleanliness": 90},
		{"id": "lobby-reception-desk", "kind": "desk", "x": 1900, "y": 2200, "condition": 50, "cleanliness": 40},
		{"id": "office1-chair", "kind": "chair", "x": 1800, "y": 6950, "condition": 60, "cleanliness": 70},
		{"id": "office1-atm", "kind": "atm", "x": 2000, "y": 7000, "condition": 60, "cleanliness": 70},
		{"id": "office1-vending", "kind": "vending_machine", "x": 2200, "y": 7000, "condition": 60, "cleanliness": 70},
	]
	client._rebuild_bridge_objects(objects)
	client._sync_prop_surfaces(objects)
	var desk = client.dynamic_root.get_node("office1-desk")
	check(desk is Prop, "Native props must be integrated into the actual client")
	check(is_equal_approx(desk.repair_seam.scale.x, 0.15), "Client must use authoritative snapshot condition")
	objects[0]["condition"] = 100
	objects[0]["cleanliness"] = 100
	client._sync_prop_surfaces(objects)
	check(not desk.repair_seam.visible, "Repair must update without changing rooms")
	# Rebuilding immediately must release names before deferred deletion.
	client._rebuild_bridge_objects(objects)
	client._sync_prop_surfaces(objects)
	check(client.dynamic_root.get_child_count() == 5, "Rebuild must not duplicate props")
	for id in ["office1-chair", "office1-atm", "office1-vending"]:
		var service = client.dynamic_root.get_node(id)
		check(service is Service, id + " must use the new native service model")
		check(is_equal_approx(service.repair_seam.scale.x, 0.40), "Service surfaces must use snapshot condition")
	var reception = client.dynamic_root.get_node("lobby-reception-desk")
	check(reception.has_node("Countertop"), "Reception desk must preserve its distinct counter")
	client.free()
	await process_frame
	print("Office prop checks: ", "PASS" if failures == 0 else "FAIL (%d)" % failures)
	quit(0 if failures == 0 else 1)
