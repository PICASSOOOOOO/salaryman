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
