extends SceneTree

const CharacterAppearance := preload("res://character_appearance.gd")
const CharacterScene := preload("res://agentshire-assets/characters/character-male-a.glb")
const PlayerController := preload("res://player_controller.gd")
const SOURCE_PALETTE := preload("res://agentshire-assets/characters/Textures/colormap.png")

var failures := 0


func _initialize() -> void:
	call_deferred("_run")


func check(value: bool, message: String) -> void:
	if not value:
		failures += 1
		push_error(message)


func _run() -> void:
	check(PlayerController.appearance_for_role("accounting") == "finance", "Finance roles need a consistent wardrobe")
	check(PlayerController.appearance_for_role("market-research") == "research", "Research roles need a consistent wardrobe")
	check(PlayerController.appearance_for_role("marketing") == "creative", "Marketing roles need a consistent wardrobe")
	check(PlayerController.appearance_for_role("crm-calls") == "service", "CRM roles need a consistent wardrobe")
	check(
		PlayerController.appearance_for_role("unknown-domain") == PlayerController.appearance_for_role("unknown-domain"),
		"Unknown roles must receive a stable appearance",
	)

	var model := CharacterScene.instantiate() as Node3D
	check(model != null, "The shared Godot character must instantiate")
	if model == null:
		_finish()
		return
	root.add_child(model)
	var animation := PlayerController.configure_character_model(model, PlayerController.MODEL_SCALE, "salaryman")
	check(is_equal_approx(model.scale.x, 0.85), "The model must be narrowed to adult proportions")
	check(is_equal_approx(model.scale.y, 3.8), "The model must retain grounded adult height")
	check(is_equal_approx(model.scale.z, 1.3), "The model must retain natural body depth")

	var skeleton_nodes := model.find_children("*", "Skeleton3D", true, false)
	check(not skeleton_nodes.is_empty(), "The animated character must keep its Skeleton3D")
	if not skeleton_nodes.is_empty():
		var skeleton := skeleton_nodes[0] as Skeleton3D
		var head_bone := skeleton.find_bone("head")
		check(head_bone >= 0, "The animated character must retain its head bone")
		if head_bone >= 0:
			var head_scale := skeleton.get_bone_pose_scale(head_bone)
			check(head_scale.distance_to(Vector3(0.58, 0.23, 0.60)) < 0.001, "The head must be scaled through its animated bone")

	check(animation != null, "The shared character must retain its AnimationPlayer")
	if animation != null:
		for animation_name in ["idle", "walk", "sprint", "jump"]:
			check(animation.has_animation(animation_name), "The character must retain %s animation" % animation_name)
		if animation.has_animation("idle"):
			animation.play("idle")
			await process_frame
			check(animation.is_playing(), "The redesigned character must play the original idle animation")
			if not skeleton_nodes.is_empty():
				var skeleton := skeleton_nodes[0] as Skeleton3D
				var head_bone := skeleton.find_bone("head")
				if head_bone >= 0:
					check(
						skeleton.get_bone_pose_scale(head_bone).distance_to(Vector3(0.58, 0.23, 0.60)) < 0.001,
						"Idle animation must not undo the adult head proportions",
					)

	for mesh_name in ["body-mesh", "head-mesh"]:
		var mesh_instance := model.find_child(mesh_name, true, false) as MeshInstance3D
		check(mesh_instance != null, "%s must remain in the animated character" % mesh_name)
		if mesh_instance != null and mesh_instance.mesh != null and mesh_instance.mesh.get_surface_count() > 0:
			var material := mesh_instance.get_active_material(0) as StandardMaterial3D
			check(material != null and material.albedo_texture != SOURCE_PALETTE, "%s must use its professional palette" % mesh_name)

	var tie := model.find_child("Tie", true, false) as MeshInstance3D
	var knot := model.find_child("TieKnot", true, false) as MeshInstance3D
	check(tie != null and knot != null, "The salaryman look must include a tie and knot")
	if tie != null and tie.mesh != null:
		var tie_material := tie.mesh.surface_get_material(0) as StandardMaterial3D
		check(tie_material != null and tie_material.albedo_color != Color.WHITE, "Tie accent must remain a solid wardrobe color")

	model.free()
	_finish()


func _finish() -> void:
	print("Character appearance checks: ", "PASS" if failures == 0 else "FAIL (%d)" % failures)
	quit(0 if failures == 0 else 1)
