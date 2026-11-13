extends SceneTree

const AtmosphereProfile = preload("res://atmosphere_profile.gd")
var failures := 0


func _initialize() -> void:
	call_deferred("_run")


func check(value: bool, message: String) -> void:
	if not value:
		failures += 1
		push_error(message)


func _run() -> void:
	var healthy := AtmosphereProfile.deterioration_mix({
		"objects": [{"condition": 100, "cleanliness": 100}],
	})
	var worn := AtmosphereProfile.deterioration_mix({
		"objects": [{"condition": 55, "cleanliness": 45}],
	})
	var degraded := AtmosphereProfile.deterioration_mix({
		"objects": [{"condition": 0, "cleanliness": 0}],
		"basement": {"building": {
			"powerCondition": 0,
			"plumbingCondition": 0,
			"upkeepCondition": 0,
		}},
	})
	var missing := AtmosphereProfile.deterioration_mix({"objects": []})
	check(is_equal_approx(healthy, 0.0), "Healthy surfaces must preserve the solar baseline")
	check(is_equal_approx(worn, 0.5), "Surface wear must blend proportionally")
	check(is_equal_approx(degraded, 1.0), "Fully degraded building state must reach the cyberpunk grade")
	check(is_equal_approx(missing, 0.0), "Missing maintenance data must not imply deterioration")

	var solar_profile: Dictionary = AtmosphereProfile.profile(0.0)
	var cyber_profile: Dictionary = AtmosphereProfile.profile(1.0)
	check(solar_profile["ambient_color"] != cyber_profile["ambient_color"], "Ambient lighting must shift with persisted condition")
	check(solar_profile["rim_color"] != cyber_profile["rim_color"], "Rim light must gain restrained magenta at the cyberpunk end")
	check(float(cyber_profile["ambient_energy"]) < float(solar_profile["ambient_energy"]), "Degraded ambience must deepen shadows")
	print("Atmosphere profile checks: ", "PASS" if failures == 0 else "FAIL (%d)" % failures)
	quit(0 if failures == 0 else 1)
