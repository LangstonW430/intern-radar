from intern_radar_ml.embed import build_embed_text, embedding_version


def test_build_embed_text_prefers_jd():
    item = {
        "title": "SWE Intern",
        "company": "Acme",
        "category": "swe",
        "jdText": "Full description here.",
    }
    assert build_embed_text(item) == "Full description here."


def test_build_embed_text_falls_back_to_metadata():
    item = {"title": "SWE Intern", "company": "Acme", "category": "swe", "jdText": None}
    assert build_embed_text(item) == "SWE Intern at Acme (swe)"


def test_embedding_version_stable_and_text_sensitive():
    a = embedding_version("hello")
    assert a == embedding_version("hello")
    assert a != embedding_version("hello!")
    assert len(a) == 16
