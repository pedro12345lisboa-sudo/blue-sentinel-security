from pydantic import BaseModel, Field


class GitHubRepoStats(BaseModel):
    name: str
    full_name: str
    description: str | None = None
    stars: int = 0
    forks: int = 0
    language: str | None = None
    url: str

    model_config = {"json_schema_extra": {
        "example": {
            "name": "blue-sentinel",
            "full_name": "user/blue-sentinel",
            "description": "Cybersecurity portfolio",
            "stars": 42,
            "forks": 7,
            "language": "Python",
            "url": "https://github.com/user/blue-sentinel",
        }
    }}


class GitHubStatsResponse(BaseModel):
    username: str
    total_repos: int
    total_stars: int
    total_forks: int
    featured_repos: list[GitHubRepoStats] = []
    cached: bool = False

    model_config = {"json_schema_extra": {
        "example": {
            "username": "user",
            "total_repos": 12,
            "total_stars": 256,
            "total_forks": 40,
            "featured_repos": [],
            "cached": True,
        }
    }}
