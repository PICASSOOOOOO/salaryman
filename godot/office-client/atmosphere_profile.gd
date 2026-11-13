extends RefCounted
## Renderer-only Tower color grading derived from the maintenance snapshot.


static func deterioration_mix(scene_data: Dictionary) -> float:
	var total_condition := 0.0
	var sample_count := 0
	var objects: Variant = scene_data.get("objects", [])
	if objects is Array:
		for object_value in objects:
			if not object_value is Dictionary:
				continue
			var condition: Variant = object_value.get("condition")
			var cleanliness: Variant = object_value.get("cleanliness")
			if typeof(condition) != TYPE_INT or typeof(cleanliness) != TYPE_INT:
				continue
			total_condition += (float(condition) + float(cleanliness)) * 0.5
			sample_count += 1

	var basement_value: Variant = scene_data.get("basement", {})
	if basement_value is Dictionary:
		var building_value: Variant = basement_value.get("building", {})
		if building_value is Dictionary:
			for key in ["powerCondition", "plumbingCondition", "upkeepCondition"]:
				var value: Variant = building_value.get(key)
				if typeof(value) == TYPE_INT:
					total_condition += float(value)
					sample_count += 1

	if sample_count == 0:
		return 0.0
	var average_condition := clampf(total_condition / float(sample_count), 0.0, 100.0)
	return 1.0 - average_condition / 100.0


static func profile(mix: float) -> Dictionary:
	var amount := clampf(mix, 0.0, 1.0)
	return {
		"background": Color("#08191e").lerp(Color("#100d20"), amount),
		"ambient_color": Color("#b9d4ce").lerp(Color("#7882a4"), amount),
		"ambient_energy": lerpf(0.42, 0.32, amount),
		"sun_color": Color("#ffe4b0").lerp(Color("#9da9c5"), amount),
		"sun_energy": lerpf(0.78, 0.60, amount),
		"lobby_color": Color("#7ee0c5").lerp(Color("#35c5d3"), amount),
		"lobby_energy": lerpf(1.42, 1.34, amount),
		"rim_color": Color("#68b8ff").lerp(Color("#cd5daa"), amount),
		"rim_energy": lerpf(0.77, 0.95, amount),
	}
