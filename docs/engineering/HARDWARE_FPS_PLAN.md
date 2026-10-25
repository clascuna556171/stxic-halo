# Hardware and Gaming Telemetry — Future Module

## Scope
After developer monitoring reaches beta reliability, offer an **optional Gaming/Performance mode** with FPS, frame time, GPU utilization, temperatures and low-impact notifications.

## Feasibility
- CPU/memory are already available through the Rust sysinfo prototype.
- GPU utilization: Windows performance counters / documented vendor APIs; verify device support and overhead.
- Temperatures: possible use of LibreHardwareMonitor sensor data (https://github.com/LibreHardwareMonitor/LibreHardwareMonitor), but elevated access may be needed for some sensors.
- FPS/frame times: evaluate Intel PresentMon (https://github.com/GameTechDev/PresentMon) and ETW capture. Test supported games and anti-cheat interactions. Prefer non-injection data sources.
- Fullscreen behavior: a normal always-on-top desktop window may not overlay exclusive-fullscreen games. In those cases, hide or offer an explicitly compatible optional overlay mechanism; never promise universal support.

## Privacy and power
Gaming mode must be opt-in, rate-limited, and disabled while idle. Provide clear CPU and memory overhead metrics and allow quick disable from tray. Avoid privileged background services for core app features. Driver/hardware access must not be a prerequisite for ordinary monitoring.

## Acceptance criteria
FPS readings within reasonable error of trusted capture tools on supported titles; consistent frametime units; no input blocking, no unauthorized DLL injection; clear unsupported state; minimal overhead recorded on multiple GPUs; reproducible measurement provenance. 
