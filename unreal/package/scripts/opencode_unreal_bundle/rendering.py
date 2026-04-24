# pyright: reportAttributeAccessIssue=false, reportUnknownMemberType=false, reportUnknownArgumentType=false, reportUnknownVariableType=false, reportGeneralTypeIssues=false

import unreal  # type: ignore

from .editor import normalize_map_path, normalize_object_path


def _queue_subsystem():
    subsystem = unreal.get_editor_subsystem(unreal.MoviePipelineQueueSubsystem)
    if not subsystem:
        raise RuntimeError("Movie render queue subsystem is not available")
    return subsystem


def _load_graph(graph_path: str):
    graph = unreal.load_asset(normalize_object_path(graph_path))
    if not graph:
        raise RuntimeError("Could not load Movie Render Graph asset")
    return graph


def _load_sequence(sequence_path: str):
    sequence = unreal.load_asset(normalize_object_path(sequence_path), unreal.LevelSequence)
    if not sequence:
        raise RuntimeError("Could not load Level Sequence")
    return sequence


def configure_movie_render_graph_job(graph_path: str, sequence_path: str, map_path: str | None = None, job_name: str | None = None) -> dict:
    subsystem = _queue_subsystem()
    if subsystem.is_rendering():
        raise RuntimeError("Movie render queue is already rendering")

    graph = _load_graph(graph_path)
    sequence = _load_sequence(sequence_path)
    queue = subsystem.get_queue()
    if not queue:
        raise RuntimeError("Movie render queue is not available")

    queue.delete_all_jobs()
    job = queue.allocate_new_job(unreal.MoviePipelineExecutorJob)
    if not job:
        raise RuntimeError("Failed to allocate movie render job")

    job.set_editor_property("sequence", unreal.SoftObjectPath(sequence.get_path_name()))
    job.set_graph_preset(graph)
    job.set_editor_property("job_name", job_name or sequence.get_name())
    if map_path:
        normalized_map_path = normalize_object_path(normalize_map_path(map_path))
        job.set_editor_property("map", unreal.SoftObjectPath(normalized_map_path))

    return {
        "job_name": str(job.get_editor_property("job_name")),
        "graph_path": graph.get_path_name(),
        "sequence_path": str(job.get_editor_property("sequence")),
        "map_path": str(job.get_editor_property("map")),
        "uses_graph_configuration": job.get_graph_preset() is not None,
        "queue_job_count": len(queue.get_jobs()),
    }


def render_sequence_with_graph(graph_path: str, sequence_path: str, map_path: str | None = None, job_name: str | None = None, output_path: str | None = None) -> dict:
    configured = configure_movie_render_graph_job(graph_path, sequence_path, map_path=map_path, job_name=job_name)
    subsystem = _queue_subsystem()
    queue = subsystem.get_queue()
    jobs = queue.get_jobs() if queue else []
    if not jobs:
        raise RuntimeError("No configured movie render job was available to render")

    if output_path:
        configured["requested_output_path"] = output_path
        configured["output_path_applied"] = False
        configured["output_path_note"] = "Current scaffold keeps graph-authored output settings authoritative."

    executor = unreal.MoviePipelinePIEExecutor(subsystem)
    subsystem.render_queue_with_executor_instance(executor)
    configured["render_requested"] = True
    configured["is_rendering"] = bool(subsystem.is_rendering())
    return configured
