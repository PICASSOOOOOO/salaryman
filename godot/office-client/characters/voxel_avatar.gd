extends RefCounted
## Rebuilds the visible avatar as a rigged, block-built character.

const COLORS := {
	"skin": "#d99a72",
	"skin_shadow": "#b96f50",
	"hair": "#4a2c20",
	"hair_light": "#68402b",
	"hair_dark": "#321f1a",
	"jacket": "#174b86",
	"jacket_light": "#2465a5",
	"jacket_shadow": "#103a6b",
	"shirt": "#f4f0e7",
	"tie": "#17191c",
	"pants": "#28292b",
	"shoe": "#151719",
	"eye": "#202124",
	"eye_white": "#fffaf0",
	"button": "#b7a98a",
}


static func apply(model: Node3D) -> void:
	for node in model.find_children("*", "MeshInstance3D", true, false):
		(node as MeshInstance3D).visible = false
	var skeletons := model.find_children("*", "Skeleton3D", true, false)
	if skeletons.is_empty():
		push_error("Voxel avatar needs the source animated Skeleton3D.")
		return
	var skeleton := skeletons[0] as Skeleton3D
	_add_box(skeleton, "root", Vector3(0, 0.205, 0), Vector3(0.115, 0.105, 0.09), "pants", "waist")
	for side in [-1.0, 1.0]:
		var x: float = side * 0.034
		var limb_bone := "leg-left" if side > 0 else "leg-right"
		var arm_bone := "arm-left" if side > 0 else "arm-right"
		_add_box(skeleton, limb_bone, Vector3(x, 0.112, 0), Vector3(0.05, 0.19, 0.057), "pants", "trouser")
		_add_box(skeleton, limb_bone, Vector3(x, 0.018, 0.018), Vector3(0.058, 0.032, 0.092), "shoe", "shoe")
		_add_box(skeleton, arm_bone, Vector3(side * 0.102, 0.244, 0), Vector3(0.048, 0.17, 0.057), "jacket", "sleeve")
		_add_box(skeleton, arm_bone, Vector3(side * 0.102, 0.154, 0.005), Vector3(0.038, 0.034, 0.045), "skin", "hand")
	_add_box(skeleton, "root", Vector3(0, 0.205, 0.002), Vector3(0.095, 0.045, 0.073), "pants", "belt")
	_add_box(skeleton, "root", Vector3(0, 0.205, 0.041), Vector3(0.025, 0.018, 0.006), "shirt", "buckle")
	_add_box(skeleton, "torso", Vector3(0, 0.283, 0), Vector3(0.15, 0.17, 0.084), "jacket", "blazer")
	_add_box(skeleton, "torso", Vector3(0, 0.285, 0.045), Vector3(0.046, 0.15, 0.01), "shirt", "shirt-front")
	_add_box(skeleton, "torso", Vector3(0, 0.262, 0.052), Vector3(0.018, 0.105, 0.012), "tie", "tie")
	_add_box(skeleton, "torso", Vector3(0, 0.35, 0.047), Vector3(0.064, 0.022, 0.021), "shirt", "collar")
	for button_y in [0.305, 0.282, 0.259]:
		_add_box(skeleton, "torso", Vector3(0.043, button_y, 0.045), Vector3(0.006, 0.006, 0.004), "button", "jacket-button")
	_add_box(skeleton, "head", Vector3(0, 0.399, 0.052), Vector3(0.08, 0.085, 0.054), "skin", "face")
	_add_box(skeleton, "head", Vector3(0, 0.421, 0.006), Vector3(0.082, 0.045, 0.065), "hair", "hair-cap")
	_add_box(skeleton, "head", Vector3(0, 0.385, 0.067), Vector3(0.08, 0.018, 0.028), "hair", "fringe")
	for side in [-1.0, 1.0]:
		_add_box(skeleton, "head", Vector3(side * 0.039, 0.397, 0.006), Vector3(0.014, 0.032, 0.045), "hair", "side-lock")
		_add_box(skeleton, "head", Vector3(side * 0.041, 0.398, 0.048), Vector3(0.012, 0.024, 0.018), "skin", "ear")
		_add_box(skeleton, "head", Vector3(side * 0.019, 0.401, 0.081), Vector3(0.013, 0.014, 0.006), "eye_white", "eye-white")
		_add_box(skeleton, "head", Vector3(side * 0.019, 0.401, 0.086), Vector3(0.006, 0.011, 0.004), "eye", "pupil")
		_add_box(skeleton, "head", Vector3(side * 0.019, 0.414, 0.081), Vector3(0.016, 0.005, 0.006), "hair_dark", "eyebrow")
	_add_box(skeleton, "head", Vector3(0, 0.394, 0.083), Vector3(0.009, 0.01, 0.012), "skin_shadow", "nose")
	_add_box(skeleton, "head", Vector3(0, 0.378, 0.081), Vector3(0.016, 0.003, 0.004), "skin_shadow", "mouth")
	# Stepped blocks give the hair and shoulders the chunky silhouette in the reference.
	_add_box(skeleton, "head", Vector3(-0.02, 0.447, 0.004), Vector3(0.032, 0.012, 0.05), "hair_light", "hair-step")
	_add_box(skeleton, "head", Vector3(0.021, 0.444, 0.014), Vector3(0.028, 0.012, 0.032), "hair_dark", "hair-step-shadow")
	_add_box(skeleton, "head", Vector3(-0.043, 0.424, 0.004), Vector3(0.012, 0.024, 0.042), "hair_dark", "hair-side-shadow")
	_add_box(skeleton, "torso", Vector3(-0.058, 0.359, 0.022), Vector3(0.032, 0.022, 0.09), "jacket_light", "left-lapel")
	_add_box(skeleton, "torso", Vector3(0.058, 0.359, 0.022), Vector3(0.032, 0.022, 0.09), "jacket_light", "right-lapel")
	for side in [-1.0, 1.0]:
		var arm_bone := "arm-left" if side > 0 else "arm-right"
		_add_box(skeleton, arm_bone, Vector3(side * 0.102, 0.172, 0.03), Vector3(0.049, 0.018, 0.064), "shirt", "shirt-cuff")
		_add_box(skeleton, arm_bone, Vector3(side * 0.102, 0.185, 0.03), Vector3(0.05, 0.012, 0.065), "jacket_shadow", "sleeve-cuff")


static func _add_box(
	skeleton: Skeleton3D,
	bone_name: String,
	center: Vector3,
	size: Vector3,
	color_key: String,
	part_name: String
) -> void:
	var bone_index := skeleton.find_bone(bone_name)
	if bone_index < 0:
		return
	var shape_scale := Vector3(0.5, 1.0, 0.85)
	if bone_name == "head":
		shape_scale.x = 0.9
		shape_scale.z = 1.0
	center *= shape_scale
	size *= shape_scale
	var attachment := BoneAttachment3D.new()
	attachment.name = "Voxel_" + part_name
	attachment.bone_name = bone_name
	skeleton.add_child(attachment)
	var part := MeshInstance3D.new()
	part.name = part_name
	var box := BoxMesh.new()
	box.size = size
	part.mesh = box
	var material := StandardMaterial3D.new()
	material.albedo_color = Color(COLORS[color_key])
	material.roughness = 0.92
	material.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
	part.material_override = material
	var target := Transform3D(Basis.IDENTITY, center)
	part.transform = skeleton.get_bone_global_rest(bone_index).affine_inverse() * target
	attachment.add_child(part)
