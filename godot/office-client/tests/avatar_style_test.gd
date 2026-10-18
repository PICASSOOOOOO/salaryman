extends SceneTree

const CHARACTER_SCENE: PackedScene = preload(
	"res://agentshire-assets/characters/character-male-a.glb"
)
const AVATAR_STYLE = preload("res://characters/avatar_style.gd")
const EXPECTED_CLIPS := 32
const EXPECTED_HEAD_SCALE := 0.80


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var model := CHARACTER_SCENE.instantiate() as Node3D
	assert(model != null, "The production humanoid model must instantiate.")
	root.add_child(model)
	for skeleton_node in model.find_children("*", "Skeleton3D", true, false):
		var skeleton := skeleton_node as Skeleton3D
		for bone_index in range(skeleton.get_bone_count()):
			print(skeleton.get_bone_name(bone_index), " rest=", skeleton.get_bone_rest(bone_index))

	var animation_players := model.find_children("*", "AnimationPlayer", true, false)
	assert(not animation_players.is_empty(), "The production avatar needs its source animation player.")
	var animation_player := animation_players[0] as AnimationPlayer
	assert(
		animation_player.get_animation_list().size() == EXPECTED_CLIPS,
		"The production avatar must keep every source animation clip."
	)

	print("Avatar style test passed: %d animation clips, head scale %.2f." % [
		animation_player.get_animation_list().size(),
		EXPECTED_HEAD_SCALE,
	])
	quit()
