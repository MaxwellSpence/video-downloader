import os
import sys

# Force UTF-8 for console output on Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

import re
import time
import uuid
import threading
import logging
from pathlib import Path
from flask import Flask, request, jsonify, send_file, render_template
from flask_cors import CORS
import yt_dlp

# Set up paths for FFmpeg and Deno
BASE_DIR = Path(__file__).resolve().parent
DOWNLOADS_DIR = BASE_DIR / "downloads"
DOWNLOADS_DIR.mkdir(exist_ok=True)

FFMPEG_BIN = None
DENO_BIN = None

# Add FFmpeg and Deno to PATH on Windows if installed via winget
if sys.platform == "win32":
    WINGET_PACKAGES = Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft" / "WinGet" / "Packages"
    for p in WINGET_PACKAGES.glob("Gyan.FFmpeg*/**/ffmpeg.exe"):
        FFMPEG_BIN = str(p.parent)
        break

    for p in WINGET_PACKAGES.glob("DenoLand.Deno*/**/deno.exe"):
        DENO_BIN = str(p.parent)
        break

    current_path = os.environ.get("PATH", "")
    path_additions = [p for p in [FFMPEG_BIN, DENO_BIN] if p and p not in current_path]
    if path_additions:
        os.environ["PATH"] = ";".join(path_additions) + ";" + current_path

app = Flask(__name__, static_folder="static", template_folder="templates")
CORS(app)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# Active background tasks
tasks = {}
tasks_lock = threading.Lock()


def format_duration(seconds):
    if not seconds:
        return "00:00"
    seconds = int(seconds)
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    secs = seconds % 60
    if hours > 0:
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"
    return f"{minutes:02d}:{secs:02d}"


def detect_platform(url: str) -> str:
    url_lower = url.lower()
    if "youtube.com" in url_lower or "youtu.be" in url_lower:
        return "youtube"
    elif "tiktok.com" in url_lower:
        return "tiktok"
    elif "instagram.com" in url_lower:
        return "instagram"
    elif "twitter.com" in url_lower or "x.com" in url_lower:
        return "twitter"
    elif "facebook.com" in url_lower or "fb.watch" in url_lower:
        return "facebook"
    elif "reddit.com" in url_lower or "redd.it" in url_lower:
        return "reddit"
    return "generic"


def get_base_ydl_opts():
    opts = {
        "quiet": True,
        "no_warnings": True,
    }
    if FFMPEG_BIN:
        opts["ffmpeg_location"] = FFMPEG_BIN
    return opts



def cleanup_old_files():
    """Removes files in downloads directory older than 1 hour"""
    while True:
        try:
            time.sleep(300)
            now = time.time()
            for item in DOWNLOADS_DIR.iterdir():
                if item.is_file():
                    if now - item.stat().st_mtime > 3600:
                        try:
                            item.unlink()
                        except Exception:
                            pass
        except Exception as e:
            logger.error(f"Cleanup error: {e}")


# Run cleanup in daemon thread
cleanup_thread = threading.Thread(target=cleanup_old_files, daemon=True)
cleanup_thread.start()


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/info", methods=["POST"])
def get_video_info():
    data = request.get_json() or {}
    url = (data.get("url") or "").strip()

    if not url:
        return jsonify({"error": "Por favor, insira o link do vídeo."}), 400

    platform = detect_platform(url)

    ydl_opts = get_base_ydl_opts()
    ydl_opts.update({
        "extract_flat": False,
        "noplaylist": True,
    })

    try:
        info = None
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
        except Exception as e_first:
            if platform == "youtube":
                logger.warning(f"Primary YouTube extraction failed ({e_first}), trying fallback clients...")
                fallback_opts = get_base_ydl_opts()
                fallback_opts.update({
                    "extract_flat": False,
                    "noplaylist": True,
                    "extractor_args": {
                        "youtube": {
                            "player_client": ["android", "ios", "visionos"],
                            "player_skip": ["webpage", "configs"]
                        }
                    }
                })
                with yt_dlp.YoutubeDL(fallback_opts) as ydl_fb:
                    info = ydl_fb.extract_info(url, download=False)
            else:
                raise e_first

            if not info:
                return jsonify({"error": "Não foi possível obter informações do vídeo."}), 400

            title = info.get("title") or "Vídeo"
            thumbnail = info.get("thumbnail") or ""
            duration = info.get("duration")
            uploader = info.get("uploader") or info.get("channel") or info.get("creator") or "Desconhecido"

            formats = info.get("formats", [])
            # Extract available resolutions
            heights = set()
            for f in formats:
                h = f.get("height")
                # Ensure it's a valid resolution with video
                if h and isinstance(h, int) and h >= 144:
                    if f.get("vcodec") != "none":
                        heights.add(h)

            sorted_heights = sorted(list(heights), reverse=True)

            # Map to standard clean options
            standard_resolutions = []
            standard_targets = [2160, 1440, 1080, 720, 480, 360]
            
            # If heights found, filter by matching or closest lower
            for target in standard_targets:
                if any(h >= target for h in sorted_heights):
                    label = f"{target}p"
                    if target == 2160:
                        label += " (4K UHD)"
                    elif target == 1440:
                        label += " (2K QHD)"
                    elif target == 1080:
                        label += " (Full HD)"
                    elif target == 720:
                        label += " (HD)"
                    standard_resolutions.append({"value": str(target), "label": label})

            # If no standard resolutions were matched (e.g. TikTok / Instagram portrait), add default resolutions
            if not standard_resolutions and sorted_heights:
                for h in sorted_heights[:4]:
                    standard_resolutions.append({"value": str(h), "label": f"{h}p"})

            # Build preview embed info
            video_id = info.get("id") or ""
            is_vertical = False
            w = info.get("width")
            h = info.get("height")
            if w and h and h > w:
                is_vertical = True

            embed_info = {"type": "fallback", "url": "", "is_vertical": is_vertical}

            url_lower = url.lower()
            if platform == "youtube":
                embed_info = {
                    "type": "iframe",
                    "url": f"https://www.youtube-nocookie.com/embed/{video_id}?autoplay=0&rel=0",
                    "is_vertical": is_vertical
                }
            elif platform == "tiktok":
                m = re.search(r'/video/(\d+)', url)
                vid = m.group(1) if m else video_id
                embed_info = {
                    "type": "iframe",
                    "url": f"https://www.tiktok.com/player/v1/{vid}",
                    "is_vertical": True
                }
            elif platform == "instagram":
                m = re.search(r'/(?:p|reel|tv)/([^/?#&]+)', url)
                code = m.group(1) if m else video_id
                embed_info = {
                    "type": "iframe",
                    "url": f"https://www.instagram.com/reel/{code}/embed/",
                    "is_vertical": True
                }
            else:
                # Try finding direct progressive mp4 stream for native video tag
                for fmt in reversed(formats):
                    if fmt.get("vcodec") != "none" and fmt.get("acodec") != "none" and fmt.get("ext") == "mp4" and fmt.get("url"):
                        embed_info = {
                            "type": "video",
                            "url": fmt.get("url"),
                            "is_vertical": is_vertical
                        }
                        break

            return jsonify({
                "success": True,
                "url": url,
                "platform": platform,
                "title": title,
                "thumbnail": thumbnail,
                "duration": format_duration(duration),
                "duration_raw": duration,
                "uploader": uploader,
                "resolutions": standard_resolutions,
                "embed": embed_info,
            })

    except Exception as e:
        err_msg = str(e)
        logger.error(f"Error fetching info for {url}: {err_msg}")
        clean_err = "Erro ao analisar o link. Verifique se o vídeo é público e o link está correto."
        if "Private video" in err_msg:
            clean_err = "Este vídeo é privado ou requer login."
        elif "Sign in to confirm" in err_msg:
            clean_err = "Este vídeo possui restrição de idade ou requer login."
        elif "Video unavailable" in err_msg:
            clean_err = "Vídeo indisponível ou excluído."
        return jsonify({"error": clean_err, "details": err_msg}), 400


@app.route("/api/test_invidious", methods=["GET"])
def test_invidious():
    import urllib.request
    video_id = request.args.get("id", "fzKQzmesaeY")
    instances = [
        "https://invidious.nerdvpn.de",
        "https://inv.nadeko.net",
        "https://invidious.jing.rocks",
        "https://yt.artemislena.eu",
        "https://invidious.private.coffee",
        "https://invidious.drgns.space",
        "https://inv.tux.pizza"
    ]
    for inst in instances:
        try:
            req = urllib.request.Request(f"{inst}/api/v1/videos/{video_id}", headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=5) as res:
                if res.status == 200:
                    data = json.loads(res.read().decode("utf-8"))
                    fmts = data.get("formatStreams", [])
                    return jsonify({
                        "status": "success",
                        "instance": inst,
                        "title": data.get("title"),
                        "format_streams_count": len(fmts),
                        "first_format": fmts[0] if fmts else None
                    })
        except Exception as e:
            continue
    return jsonify({"status": "error", "message": "All invidious instances failed"}), 502


@app.route("/api/debug_yt", methods=["GET"])

def debug_yt():
    url = request.args.get("url", "https://www.youtube.com/watch?v=fzKQzmesaeY")
    tests = [
        ("android_skip_webpage", ["android"], ["webpage", "configs"]),
        ("android_vr_skip_webpage", ["android_vr"], ["webpage", "configs"]),
        ("tv_skip_webpage", ["tv"], ["webpage", "configs"]),
        ("tv_downgraded_skip_webpage", ["tv_downgraded"], ["webpage", "configs"]),
        ("ios_skip_webpage", ["ios"], ["webpage", "configs"]),
        ("visionos_skip_webpage", ["visionos"], ["webpage", "configs"]),
    ]
    results = {}
    for name, cl, skips in tests:
        opts = {
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "extractor_args": {
                "youtube": {
                    "player_client": cl,
                    "player_skip": skips
                }
            }
        }
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=False)
                fmts = [f for f in info.get("formats", []) if f.get("vcodec") != "none"]
                heights = sorted(list(set(f.get("height") for f in fmts if f.get("height"))))
                results[name] = {
                    "status": "success",
                    "title": info.get("title"),
                    "formats_count": len(fmts),
                    "heights": heights
                }
        except Exception as e:
            results[name] = {
                "status": "error",
                "error": str(e).split("\n")[0][:120]
            }
    return jsonify(results)




def background_downloader(task_id: str, url: str, dl_format: str, quality: str):
    with tasks_lock:
        task = tasks.get(task_id)
        if not task:
            return

    def progress_hook(d):
        status = d.get("status")
        with tasks_lock:
            t = tasks.get(task_id)
            if not t:
                return
            if status == "downloading":
                t["status"] = "downloading"
                total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
                downloaded = d.get("downloaded_bytes") or 0
                if total > 0:
                    t["progress"] = min(99.0, round((downloaded / total) * 100, 1))
                else:
                    t["progress"] = min(95.0, t.get("progress", 0) + 1.0)
                
                speed = d.get("speed")
                if speed:
                    if speed > 1024 * 1024:
                        t["speed"] = f"{speed / (1024 * 1024):.1f} MB/s"
                    else:
                        t["speed"] = f"{speed / 1024:.0f} KB/s"
                else:
                    t["speed"] = ""

                eta = d.get("eta")
                if eta:
                    t["eta"] = f"{int(eta)}s"
                else:
                    t["eta"] = ""

            elif status == "finished":
                t["status"] = "converting"
                t["progress"] = 99.0
                t["speed"] = ""
                t["eta"] = "Finalizando..."

    out_template = str(DOWNLOADS_DIR / f"{task_id}_%(title).100s.%(ext)s")

    ydl_opts = get_base_ydl_opts()
    ydl_opts.update({
        "outtmpl": out_template,
        "progress_hooks": [progress_hook],
        "noplaylist": True,
    })

    if dl_format == "mp3":
        # Extract audio and convert to MP3
        ydl_opts.update({
            "format": "bestaudio/best",
            "postprocessors": [
                {
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "mp3",
                    "preferredquality": "320",
                },
                {"key": "FFmpegMetadata"},
            ],
        })
    else:
        # MP4 video
        if quality == "best":
            format_str = "bestvideo+bestaudio/best"
        else:
            try:
                h = int(quality)
                format_str = f"bestvideo[height<={h}]+bestaudio/best[height<={h}]/best"
            except ValueError:
                format_str = "bestvideo+bestaudio/best"

        ydl_opts.update({
            "format": format_str,
            "merge_output_format": "mp4",
            "postprocessors": [
                {"key": "FFmpegMetadata"},
            ],
        })

    try:
        info = None
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
        except Exception as e_dl:
            platform = detect_platform(url)
            if platform == "youtube":
                logger.warning(f"Download failed with primary config ({e_dl}), retrying with fallback...")
                fb_opts = dict(ydl_opts)
                fb_opts["extractor_args"] = {
                    "youtube": {
                        "player_client": ["android", "ios", "visionos"],
                        "player_skip": ["webpage", "configs"]
                    }
                }
                with yt_dlp.YoutubeDL(fb_opts) as ydl_fb:
                    info = ydl_fb.extract_info(url, download=True)
            else:
                raise e_dl

            title = info.get("title") or "download"
            ext = "mp3" if dl_format == "mp3" else "mp4"

            # Locate the generated file
            target_file = None
            for f in DOWNLOADS_DIR.glob(f"{task_id}_*"):
                if f.is_file() and not f.name.endswith(".part") and not f.name.endswith(".ytdl"):
                    target_file = f
                    break

            if not target_file or not target_file.exists():
                raise RuntimeError("Arquivo baixado não foi encontrado após o processamento.")

            file_size_bytes = target_file.stat().st_size
            if file_size_bytes > 1024 * 1024:
                size_str = f"{file_size_bytes / (1024 * 1024):.1f} MB"
            else:
                size_str = f"{file_size_bytes / 1024:.1f} KB"

            clean_filename = re.sub(r'[\\/*?:"<>|]', "", title).strip() + f".{ext}"

            with tasks_lock:
                if task_id in tasks:
                    tasks[task_id].update({
                        "status": "completed",
                        "progress": 100.0,
                        "file_path": str(target_file),
                        "file_name": clean_filename,
                        "file_size": size_str,
                        "title": title,
                        "ext": ext,
                    })

    except Exception as e:
        logger.error(f"Download failed for task {task_id}: {e}")
        with tasks_lock:
            if task_id in tasks:
                tasks[task_id].update({
                    "status": "error",
                    "error": str(e),
                })


@app.route("/api/download", methods=["POST"])
def start_download():
    data = request.get_json() or {}
    url = (data.get("url") or "").strip()
    dl_format = data.get("format", "mp4").lower()
    quality = data.get("quality", "best")

    if not url:
        return jsonify({"error": "URL não fornecida."}), 400

    task_id = str(uuid.uuid4())
    with tasks_lock:
        tasks[task_id] = {
            "id": task_id,
            "url": url,
            "format": dl_format,
            "quality": quality,
            "status": "queued",
            "progress": 0.0,
            "speed": "",
            "eta": "Iniciando...",
            "file_path": None,
            "file_name": None,
            "file_size": None,
            "error": None,
            "created_at": time.time(),
        }

    thread = threading.Thread(
        target=background_downloader,
        args=(task_id, url, dl_format, quality),
        daemon=True,
    )
    thread.start()

    return jsonify({"success": True, "taskId": task_id})


@app.route("/api/progress/<task_id>", methods=["GET"])
def get_progress(task_id):
    with tasks_lock:
        task = tasks.get(task_id)
        if not task:
            return jsonify({"error": "Tarefa não encontrada."}), 404
        return jsonify(task)


@app.route("/api/file/<task_id>", methods=["GET"])
def download_file(task_id):
    with tasks_lock:
        task = tasks.get(task_id)
        if not task:
            return jsonify({"error": "Arquivo não encontrado."}), 404

        file_path = task.get("file_path")
        file_name = task.get("file_name")

    if not file_path or not os.path.exists(file_path):
        return jsonify({"error": "Arquivo não disponível ou expirado."}), 404

    return send_file(
        file_path,
        as_attachment=True,
        download_name=file_name,
        conditional=True,
    )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"\n=======================================================")
    print(f"🚀 Video Downloader Web App rodando em: http://localhost:{port}")
    print(f"Suporte a YouTube, TikTok, Instagram, MP4 (qualidades) e MP3")
    print(f"=======================================================\n")
    app.run(host="0.0.0.0", port=port, debug=False)
