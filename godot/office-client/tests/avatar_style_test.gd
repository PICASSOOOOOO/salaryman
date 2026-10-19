extends SceneTree

const CHARACTER_SCENE: PackedScene = preload(
	"res://agentshire-assets/characters/character-male-a.glb"
)
const AVATAR_STYLE = preload("res://characters/voxel_avatar.gd")
const EXPECTED_CLIPS := 32


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var model := CHARACTER_SCENE.instantiate() as Node3D
	assert(model != null, "The production humanoid model must instantiate.")
	root.add_child(model)
	AVATAR_STYLE.apply(model)
	var visible_parts := 0
	var original_meshes_hidden := true
	for node in model.find_children("*", "MeshInstance3D", true, false):
		var mesh := node as MeshInstance3D
		if mesh.name in ["body-mesh", "head-mesh"] and mesh.visible:
			original_meshes_hidden = false
		if mesh.visible:
			visible_parts += 1
	print("Visible model meshes after voxel rebuild: ", visible_parts)
	assert(visible_parts >= 20, "The voxel avatar must replace the source meshes with block-built parts.")
	assert(original_meshes_hidden, "The original oversized source meshes must stay hidden.")

	AVATAR_STYLE.set_wardrobe(model, {
		"jacket": {"color": "#b33a2f"},
		"tie": {"visible": false},
	})
	var custom_jacket_found := false
	var tie_hidden := true
	for node in model.find_children("*", "MeshInstance3D", true, false):
		var mesh := node as MeshInstance3D
		if not mesh.has_meta("wardrobe_slot"):
			continue
		if mesh.get_meta("wardrobe_color_key") == "jacket":
			custom_jacket_found = (
				(mesh.material_override as StandardMaterial3D).albedo_color
				.is_equal_approx(Color("#b33a2f"))
			)
		if mesh.get_meta("wardrobe_slot") == "tie" and mesh.visible:
			tie_hidden = false
	assert(custom_jacket_found, "A character's jacket color must be changeable at runtime.")
	assert(tie_hidden, "A wardrobe must be able to hide an individual garment.")

	AVATAR_STYLE.set_wardrobe(model, {})
	var tie_restored := false
	for node in model.find_children("*", "MeshInstance3D", true, false):
		var mesh := node as MeshInstance3D
		if mesh.has_meta("wardrobe_slot") and mesh.get_meta("wardrobe_slot") == "tie":
			tie_restored = tie_restored or mesh.visible
	assert(tie_restored, "Resetting a wardrobe must restore the default outfit.")

	AVATAR_STYLE.set_wardrobe(model, AVATAR_STYLE.wardrobe_preset("shirt_only"))
	var shirt_layer_visible := false
	var jacket_removed := true
	for node in model.find_children("*", "MeshInstance3D", true, false):
		var mesh := node as MeshInstance3D
		if not mesh.has_meta("wardrobe_slot"):
			continue
		if mesh.name == "shirt-torso":
			shirt_layer_visible = mesh.visible
		if mesh.get_meta("wardrobe_slot") == "jacket" and mesh.visible:
			jacket_removed = false
	assert(shirt_layer_visible, "The shirt-only outfit must reveal a complete shirt torso.")
	assert(jacket_removed, "The shirt-only outfit must remove all jacket parts.")
	AVATAR_STYLE.set_wardrobe(model, AVATAR_STYLE.wardrobe_preset("reference"))

	var second_model := CHARACTER_SCENE.instantiate() as Node3D
	root.add_child(second_model)
	AVATAR_STYLE.apply(second_model)
	var second_jacket_stays_default := false
	for node in second_model.find_children("*", "MeshInstance3D", true, false):
		var mesh := node as MeshInstance3D
		if mesh.has_meta("wardrobe_color_key") and mesh.get_meta("wardrobe_color_key") == "jacket":
			second_jacket_stays_default = (
				(mesh.material_override as StandardMaterial3D).albedo_color
				.is_equal_approx(Color("#174b86"))
			)
	assert(second_jacket_stays_default, "Changing one character's wardrobe must not recolor another.")
	second_model.queue_free()

	var animation_players := model.find_children("*", "AnimationPlayer", true, false)
	assert(not animation_players.is_empty(), "The production avatar needs its source animation player.")
	var animation_player := animation_players[0] as AnimationPlayer
	assert(
		animation_player.get_animation_list().size() == EXPECTED_CLIPS,
		"The production avatar must keep every source animation clip."
	)

	print("Voxel avatar test passed: %d animation clips and %d visible block parts." % [
		animation_player.get_animation_list().size(),
		visible_parts,
	])
	quit()
