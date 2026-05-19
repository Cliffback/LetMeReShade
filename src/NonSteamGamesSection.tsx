import { callable } from '@decky/api';
import {
  ButtonItem,
  ConfirmModal,
  DropdownItem,
  PanelSection,
  PanelSectionRow,
  showModal,
} from '@decky/ui';
import { useEffect, useState } from 'react';

// Define interfaces
interface NonSteamGameInfo {
  name: string;
  exe: string;
  start_dir: string;
  appid: string;
}

interface DllOverride {
  label: string;
  value: string;
}

interface NonSteamResponse {
  status: string;
  message?: string;
  output?: string;
  games?: NonSteamGameInfo[];
  api?: string;
}

interface PathCheckResponse {
  exists: boolean;
  is_addon: boolean;
}

interface ExecutableInfo {
  path: string;
  directory_path: string;
  filename: string;
  relative_path?: string;
  score?: number;
  size_mb?: number;
}

interface DetectionResult {
  status: string;
  method?: string;
  executable_path?: string;
  directory_path?: string;
  filename?: string;
  all_executables?: ExecutableInfo[];
  confidence?: string;
  message?: string;
}

interface NonSteamExecutableDetectionResponse {
  status: string;
  non_steam_detection_result?: DetectionResult;
  recommended_method?: string;
  message?: string;
}

// Define callables
const listNonSteamGames = callable<[], NonSteamResponse>(
  'list_non_steam_games',
);
const findNonSteamGameExecutablePath = callable<
  [string, string, string],
  NonSteamExecutableDetectionResponse
>('find_non_steam_game_executable_path');
const installReshadeForNonSteamGame = callable<
  [string, string, string],
  NonSteamResponse
>('install_reshade_for_non_steam_game');
const uninstallReshadeForNonSteamGame = callable<[string], NonSteamResponse>(
  'uninstall_reshade_for_non_steam_game',
);
const detectHeroicGameApi = callable<
  [string],
  { status: string; api?: string; message?: string }
>('detect_heroic_game_api');
const checkReShadePath = callable<[], PathCheckResponse>('check_reshade_path');
const logError = callable<[string], void>('log_error');

const NonSteamGamesSection = () => {
  const [games, setGames] = useState<NonSteamGameInfo[]>([]);
  const [selectedGame, setSelectedGame] = useState<NonSteamGameInfo | null>(
    null,
  );
  const [selectedDll, setSelectedDll] = useState<DllOverride | null>(null);
  const [result, setResult] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [apiDetecting, setApiDetecting] = useState<boolean>(false);
  const [executableDetection, setExecutableDetection] =
    useState<NonSteamExecutableDetectionResponse | null>(null);
  const [checkingExecutable, setCheckingExecutable] = useState<boolean>(false);
  const [selectedExecutablePath, setSelectedExecutablePath] =
    useState<string>('');

  const dllOverrides: DllOverride[] = [
    { label: 'Automatic (Detect API)', value: 'auto' },
    { label: 'DXGI (DirectX 10/11/12)', value: 'dxgi' },
    { label: 'D3D9 (DirectX 9)', value: 'd3d9' },
    { label: 'D3D8 (DirectX 8)', value: 'd3d8' },
    { label: 'D3D11 (DirectX 11)', value: 'd3d11' },
    { label: 'DDraw (DirectDraw)', value: 'ddraw' },
    { label: 'DInput8 (DirectInput)', value: 'dinput8' },
    { label: 'OpenGL32 (OpenGL)', value: 'opengl32' },
  ];

  useEffect(() => {
    const loadGames = async () => {
      try {
        setLoading(true);
        const response = await listNonSteamGames();
        if (response.status === 'success' && response.games) {
          setGames(response.games);
        } else {
          setResult(
            `Failed to load non-Steam games: ${response.message || 'Unknown error'}`,
          );
        }
      } catch (error) {
        setResult(
          `Error loading non-Steam games: ${error instanceof Error ? error.message : String(error)}`,
        );
        await logError(`NonSteamGamesSection -> loadGames: ${String(error)}`);
      } finally {
        setLoading(false);
      }
    };

    loadGames();
  }, []);

  // Check executable detection when a game is selected
  useEffect(() => {
    const checkExecutableDetection = async () => {
      if (!selectedGame) {
        setExecutableDetection(null);
        setSelectedExecutablePath('');
        return;
      }

      try {
        setCheckingExecutable(true);
        const detection = await findNonSteamGameExecutablePath(
          selectedGame.exe,
          selectedGame.start_dir,
          selectedGame.name,
        );
        setExecutableDetection(detection);

        // Set default selected executable path based on detection
        if (
          detection.status === 'success' &&
          detection.non_steam_detection_result?.status === 'success'
        ) {
          setSelectedExecutablePath(
            detection.non_steam_detection_result.executable_path || '',
          );
        }
      } catch (error) {
        await logError(
          `Non-Steam executable detection error: ${String(error)}`,
        );
        setExecutableDetection(null);
        setSelectedExecutablePath('');
      } finally {
        setCheckingExecutable(false);
      }
    };

    checkExecutableDetection();
  }, [selectedGame]);

  const handleInstallReShade = async () => {
    if (!selectedGame) {
      setResult('Please select a game.');
      return;
    }

    if (!selectedDll) {
      setResult('Please select a DLL override or "Automatic".');
      return;
    }

    try {
      const reshadeCheck = await checkReShadePath();
      if (!reshadeCheck.exists) {
        setResult('Please install ReShade first before patching games.');
        return;
      }

      // Determine the game directory for installation
      const gameDir = selectedExecutablePath
        ? selectedExecutablePath.substring(
            0,
            selectedExecutablePath.lastIndexOf('/'),
          )
        : selectedGame.start_dir ||
          selectedGame.exe.substring(0, selectedGame.exe.lastIndexOf('/'));

      // If automatic is selected, detect the API
      let finalDllOverride = selectedDll.value;
      if (finalDllOverride === 'auto') {
        setApiDetecting(true);
        setResult('Detecting best API for your game...');

        const detectionResponse = await detectHeroicGameApi(gameDir);

        if (detectionResponse.status === 'success' && detectionResponse.api) {
          finalDllOverride = detectionResponse.api;
          setResult(
            `Detected ${finalDllOverride.toUpperCase()} as the best API for this game.`,
          );
        } else {
          finalDllOverride = 'dxgi';
          setResult(
            `API detection failed: ${detectionResponse.message || 'Unknown error'}. Using DXGI as fallback.`,
          );
        }
        setApiDetecting(false);
      }

      const getDetectionInfo = () => {
        let info = `Are you sure you want to install ReShade for ${selectedGame.name} with ${finalDllOverride.toUpperCase()} API?`;

        if (selectedExecutablePath) {
          const fileName = selectedExecutablePath.split('/').pop();
          info += `\n\nSelected executable: ${fileName}`;
          info += `\nLocation: ${selectedExecutablePath}`;
        }

        return info;
      };

      showModal(
        <ConfirmModal
          strTitle="Confirm Non-Steam Game Patch"
          strDescription={getDetectionInfo()}
          strOKButtonText="Install"
          strCancelButtonText="Cancel"
          onOK={async () => {
            setResult('Installing ReShade...');

            const installResponse = await installReshadeForNonSteamGame(
              gameDir,
              finalDllOverride,
              selectedExecutablePath,
            );

            if (installResponse.status === 'success') {
              let successMessage = `ReShade installed successfully for ${selectedGame.name} with ${finalDllOverride.toUpperCase()} API.\nPress HOME key in-game to open ReShade overlay.`;

              if (selectedExecutablePath) {
                const fileName = selectedExecutablePath.split('/').pop();
                successMessage += `\n\nInstalled to: ${fileName}`;
              }

              setResult(successMessage);
            } else {
              setResult(
                `Failed to install ReShade: ${installResponse.message || 'Unknown error'}`,
              );
            }
          }}
        />,
      );
    } catch (error) {
      setResult(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
      await logError(
        `NonSteamGamesSection -> handleInstallReShade: ${String(error)}`,
      );
    }
  };

  const handleUninstallReShade = async () => {
    if (!selectedGame) {
      setResult('Please select a game to uninstall ReShade from.');
      return;
    }

    try {
      const reshadeCheck = await checkReShadePath();
      if (!reshadeCheck.exists) {
        setResult('ReShade is not installed.');
        return;
      }

      const gameDir = selectedExecutablePath
        ? selectedExecutablePath.substring(
            0,
            selectedExecutablePath.lastIndexOf('/'),
          )
        : selectedGame.start_dir ||
          selectedGame.exe.substring(0, selectedGame.exe.lastIndexOf('/'));

      showModal(
        <ConfirmModal
          strTitle="Confirm Uninstall"
          strDescription={`Are you sure you want to remove ReShade from ${selectedGame.name}?`}
          strOKButtonText="Uninstall"
          strCancelButtonText="Cancel"
          onOK={async () => {
            setResult('Uninstalling ReShade...');

            const uninstallResponse =
              await uninstallReshadeForNonSteamGame(gameDir);

            if (uninstallResponse.status === 'success') {
              setResult(
                `ReShade uninstalled successfully from ${selectedGame.name}.`,
              );
            } else {
              setResult(
                `Failed to uninstall ReShade: ${uninstallResponse.message || 'Unknown error'}`,
              );
            }
          }}
        />,
      );
    } catch (error) {
      setResult(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
      await logError(
        `NonSteamGamesSection -> handleUninstallReShade: ${String(error)}`,
      );
    }
  };

  const renderExecutableSelection = () => {
    if (!executableDetection || executableDetection.status !== 'success')
      return null;

    const detectionResult = executableDetection.non_steam_detection_result;

    const executableOptions: Array<{
      path: string;
      filename: string;
      method: string;
      isRecommended: boolean;
      score?: number;
      relative_path?: string;
      displayLabel: string;
    }> = [];

    if (
      detectionResult?.status === 'success' &&
      detectionResult.all_executables
    ) {
      detectionResult.all_executables.forEach((exe, index) => {
        const isRecommended = exe.path === detectionResult.executable_path;
        executableOptions.push({
          path: exe.path,
          filename: exe.filename,
          method: 'Non-Steam Detection',
          isRecommended,
          score: exe.score,
          relative_path: exe.relative_path || `Directory ${index + 1}`,
          displayLabel: `${exe.filename} ${isRecommended ? '(RECOMMENDED)' : ''} - ${exe.relative_path || 'Detected'} (Score: ${exe.score || 0})`,
        });
      });
    }

    if (executableOptions.length === 0) return null;

    return (
      <>
        <PanelSectionRow>
          <div
            style={{
              padding: '12px',
              marginTop: '8px',
              backgroundColor: 'var(--decky-highlighted-ui-bg)',
              borderRadius: '4px',
              border: '1px solid var(--decky-subtle-border)',
            }}
          >
            <div
              style={{
                fontWeight: 'bold',
                marginBottom: '8px',
                fontSize: '0.95em',
              }}
            >
              Executable Detection Results ({executableOptions.length} found)
            </div>
          </div>
        </PanelSectionRow>

        <PanelSectionRow>
          <DropdownItem
            rgOptions={executableOptions.map((option) => ({
              data: option.path,
              label: option.displayLabel,
            }))}
            selectedOption={selectedExecutablePath}
            onChange={(option) => {
              setSelectedExecutablePath(option.data);
            }}
            strDefaultLabel="Select executable location..."
          />
        </PanelSectionRow>

        {selectedExecutablePath &&
          (() => {
            const selectedOption = executableOptions.find(
              (opt) => opt.path === selectedExecutablePath,
            );
            if (!selectedOption) return null;

            return (
              <PanelSectionRow>
                <div
                  style={{
                    padding: '8px',
                    backgroundColor: selectedOption.isRecommended
                      ? 'rgba(76, 175, 80, 0.1)'
                      : 'rgba(255, 255, 255, 0.05)',
                    borderRadius: '4px',
                    border: selectedOption.isRecommended
                      ? '1px solid rgba(76, 175, 80, 0.3)'
                      : '1px solid rgba(255, 255, 255, 0.1)',
                    fontSize: '0.85em',
                  }}
                >
                  <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                    Selected: {selectedOption.filename}
                    {selectedOption.isRecommended && (
                      <span
                        style={{
                          backgroundColor: '#4CAF50',
                          color: 'white',
                          padding: '2px 6px',
                          borderRadius: '3px',
                          fontSize: '0.8em',
                          fontWeight: 'normal',
                          marginLeft: '8px',
                        }}
                      >
                        RECOMMENDED
                      </span>
                    )}
                  </div>
                  <div style={{ opacity: 0.8, marginBottom: '2px' }}>
                    Method: {selectedOption.method}
                    {selectedOption.score !== undefined && (
                      <span style={{ marginLeft: '8px' }}>
                        (Score: {selectedOption.score})
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      opacity: 0.7,
                      fontSize: '0.8em',
                      wordBreak: 'break-all',
                    }}
                  >
                    Path: {selectedOption.relative_path}
                  </div>
                </div>
              </PanelSectionRow>
            );
          })()}
      </>
    );
  };

  return (
    <PanelSection title="Non-Steam Games ReShade">
      {loading ? (
        <PanelSectionRow>
          <div>Loading non-Steam games...</div>
        </PanelSectionRow>
      ) : games.length === 0 ? (
        <PanelSectionRow>
          <div>
            No non-Steam game shortcuts found. Add games via Steam's "Add a
            Non-Steam Game" option.
          </div>
        </PanelSectionRow>
      ) : (
        <>
          <PanelSectionRow>
            <DropdownItem
              rgOptions={games.map((game) => ({
                data: game,
                label: game.name,
              }))}
              selectedOption={selectedGame ? selectedGame : undefined}
              onChange={(option) => {
                setSelectedGame(option.data);
                setResult('');
              }}
              strDefaultLabel="Select a non-Steam game..."
            />
          </PanelSectionRow>

          {selectedGame && checkingExecutable && (
            <PanelSectionRow>
              <div style={{ fontSize: '0.9em', opacity: 0.7 }}>
                Analyzing game... Detecting executable
              </div>
            </PanelSectionRow>
          )}

          {renderExecutableSelection()}

          {selectedGame && (
            <PanelSectionRow>
              <DropdownItem
                rgOptions={dllOverrides.map((dll) => ({
                  data: dll.value,
                  label: dll.label,
                }))}
                selectedOption={selectedDll ? selectedDll.value : undefined}
                onChange={(option) => {
                  const selected = dllOverrides.find(
                    (dll) => dll.value === option.data,
                  );
                  if (selected) {
                    setSelectedDll(selected);
                    setResult('');
                  }
                }}
                strDefaultLabel="Select DLL override..."
              />
            </PanelSectionRow>
          )}

          {result && (
            <PanelSectionRow>
              <div
                style={{
                  padding: '12px',
                  marginTop: '16px',
                  backgroundColor: 'var(--decky-selected-ui-bg)',
                  borderRadius: '4px',
                }}
              >
                {result}
              </div>
            </PanelSectionRow>
          )}

          {selectedGame && (
            <>
              <PanelSectionRow>
                <ButtonItem
                  layout="below"
                  onClick={handleInstallReShade}
                  disabled={!selectedDll || apiDetecting}
                >
                  {apiDetecting ? 'Detecting API...' : 'Install ReShade'}
                </ButtonItem>
              </PanelSectionRow>
              <PanelSectionRow>
                <ButtonItem layout="below" onClick={handleUninstallReShade}>
                  Uninstall ReShade
                </ButtonItem>
              </PanelSectionRow>
            </>
          )}
        </>
      )}
    </PanelSection>
  );
};

export default NonSteamGamesSection;
