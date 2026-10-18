extends SceneTree

const CHARACTER_SCENE: PackedScene = preload(
	"res://agentshire-assets/characters/character-male-a.glb"
)
const AVATAR_STYLE = preload("res://characters/avatar_style.gd")
const EXPECTED_CLIPS := 32
const EXPECTED_HEAD_SCALE := 0.64


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var model := CHARACTER_SCENE.instantiate() as Node3D
	assert(model != null, "The production humanoid model must instantiate.")
	root.add_child(model)
	AVATAR_STYLE.apply(model)

	var animation_players := model.find_children("*", "AnimationPlayer", true, false)
	assert(not animation_players.is_empty(), "The production avatar needs its source animation player.")
	var animation_player := animation_players[0] as AnimationPlayer
	assert(
		animation_player.get_animation_list().size() == EXPECTED_CLIPS,
		"The production avatar must keep every source animation clip."
	)

	var head_scale_found := false
	for skeleton_node in model.find_children("*", "Skeleton3D", true, false):
		var skeleton := skeleton_node as Skeleton3D
		for bone_index in range(skeleton.get_bone_count()):
			if skeleton.get_bone_name(bone_index).to_lower() != "head":
				continue
			head_scale_found = is_equal_approx(
				skeleton.get_bone_pose_scale(bone_index).x,
				EXPECTED_HEAD_SCALE
			)
			break
		assert(head_scale_found, "The head bone must use the approved smaller proportion.")
	assert(head_scale_found, "The production humanoid model must include a head bone.")

	print("Avatar style test passed: %d animation clips, head scale %.2f." % [
		animation_player.get_animation_list().size(),
		EXPECTED_HEAD_SCALE,
	])
	quit()
