"""Tests for executable scoring functions in main.py."""

from main import score_heroic_executable, score_steam_executable

# --- Helpers ---


def make_exe(filename, rel_path='', size_mb=10.0):
    """Create an exe_info dict for testing."""
    return {
        'filename': filename,
        'relative_path': rel_path or filename,
        'size_mb': size_mb,
    }


# --- score_steam_executable tests ---


class TestScoreSteamExecutable:
    def test_exact_name_match_scores_highest(self):
        exe = make_exe('Cyberpunk2077.exe', 'Cyberpunk2077.exe')
        score = score_steam_executable(exe, 'Cyberpunk 2077')
        assert score > 90

    def test_partial_name_match(self):
        exe = make_exe('witcher3.exe', 'witcher3.exe')
        score = score_steam_executable(exe, 'The Witcher 3 Wild Hunt')
        # Should get some word match but not exact
        assert score > 50

    def test_common_game_exe_name_bonus(self):
        exe = make_exe('game.exe', 'game.exe')
        score_with_bonus = score_steam_executable(exe, 'Some Random Game')
        exe_no_bonus = make_exe('randomthing.exe', 'randomthing.exe')
        score_without = score_steam_executable(exe_no_bonus, 'Some Random Game')
        # 'game' keyword should boost score
        assert score_with_bonus > score_without

    def test_large_file_scores_higher_than_tiny(self):
        exe_large = make_exe('unknown.exe', 'unknown.exe', size_mb=100.0)
        exe_tiny = make_exe('unknown.exe', 'unknown.exe', size_mb=0.1)
        score_large = score_steam_executable(exe_large, 'SomeGame')
        score_tiny = score_steam_executable(exe_tiny, 'SomeGame')
        assert score_large > score_tiny

    def test_launcher_gets_penalty(self):
        exe_launcher = make_exe('gamelauncher.exe', 'gamelauncher.exe')
        exe_normal = make_exe('game.exe', 'game.exe')
        score_launcher = score_steam_executable(exe_launcher, 'SomeGame')
        score_normal = score_steam_executable(exe_normal, 'SomeGame')
        assert score_normal > score_launcher

    def test_unreal_engine_patterns_boost(self):
        exe = make_exe(
            'MyGame-Win64-Shipping.exe', 'Binaries/Win64/MyGame-Win64-Shipping.exe', size_mb=80.0
        )
        score = score_steam_executable(exe, 'MyGame')
        # Should get path bonus + shipping bonus + size bonus + name match
        assert score > 80

    def test_deep_nesting_penalty(self):
        exe_shallow = make_exe('unknown.exe', 'unknown.exe', size_mb=10.0)
        exe_deep = make_exe('unknown.exe', 'a/b/c/d/e/f/unknown.exe', size_mb=10.0)
        score_shallow = score_steam_executable(exe_shallow, 'SomeGame')
        score_deep = score_steam_executable(exe_deep, 'SomeGame')
        assert score_shallow > score_deep

    def test_score_capped_at_100(self):
        # Perfect match with all bonuses
        exe = make_exe('game.exe', 'game.exe', size_mb=100.0)
        score = score_steam_executable(exe, 'game')
        assert score <= 100

    def test_score_minimum_zero(self):
        # Tiny file, deep nesting, launcher name
        exe = make_exe('launcher.exe', 'a/b/c/d/e/f/g/h/launcher.exe', size_mb=0.01)
        score = score_steam_executable(exe, 'UnrelatedName')
        assert score >= 0

    def test_bin_directory_bonus(self):
        exe_bin = make_exe('unknown.exe', 'bin/unknown.exe')
        exe_root = make_exe('unknown.exe', 'unknown.exe')
        score_bin = score_steam_executable(exe_bin, 'SomeGame')
        score_root = score_steam_executable(exe_root, 'SomeGame')
        assert score_bin > score_root


# --- score_heroic_executable tests ---


class TestScoreHeroicExecutable:
    def test_utility_exe_filtered_out(self):
        for util_name in ['unins000.exe', 'setup.exe', 'vcredist_x64.exe', 'directx_jun.exe']:
            exe = make_exe(util_name, util_name)
            score = score_heroic_executable(exe, 'SomeGame', '/games/SomeGame')
            assert score == 0, f'{util_name} should be filtered out'

    def test_exact_name_match(self):
        exe = make_exe('DREDGE.exe', 'DREDGE.exe')
        score = score_heroic_executable(exe, 'DREDGE', '/games/DREDGE')
        assert score > 90

    def test_dir_name_match(self):
        exe = make_exe('DREDGE.exe', 'DREDGE.exe')
        score = score_heroic_executable(exe, 'Some Other Name', '/games/DREDGE')
        # Should match via directory name
        assert score > 80

    def test_space_normalized_match(self):
        exe = make_exe('amongus.exe', 'amongus.exe')
        score = score_heroic_executable(exe, 'Among Us', '/games/Among Us')
        assert score > 80

    def test_launcher_penalty(self):
        exe_launcher = make_exe('gamelauncher.exe', 'gamelauncher.exe')
        exe_game = make_exe('game.exe', 'game.exe')
        score_launcher = score_heroic_executable(exe_launcher, 'MyGame', '/games/MyGame')
        score_game = score_heroic_executable(exe_game, 'MyGame', '/games/MyGame')
        assert score_game > score_launcher

    def test_partial_match_with_extra_chars_in_dir(self):
        # Simulates dirs like "DREDGEmKMzX" from store downloads
        exe = make_exe('DREDGE.exe', 'DREDGE.exe')
        score = score_heroic_executable(exe, 'DREDGE', '/games/DREDGEmKMzX')
        assert score > 70

    def test_unreal_path_bonus(self):
        exe = make_exe('unknown.exe', 'Binaries/Win64/unknown.exe', size_mb=50.0)
        score = score_heroic_executable(exe, 'MyGame', '/games/MyGame')
        exe_root = make_exe('unknown.exe', 'unknown.exe', size_mb=50.0)
        score_root = score_heroic_executable(exe_root, 'MyGame', '/games/MyGame')
        assert score > score_root
