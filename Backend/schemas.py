"""
schemas.py — Pydantic models for request validation and OpenAPI response contracts.

Provides strongly typed schemas for:
- HackathonOut: Normalized hackathon entity exposed to consumers
- StatsOut: Aggregated radar statistics and telemetry metrics
- HackathonsResponse: Primary payload for /api/hackathons and /api/v1/hackathons
- HealthResponse: System liveness and readiness probe
- MetricsResponse: Performance telemetry (p50, p95 latency)
- RefreshResponse: Cache eviction contract
"""

from typing import Optional, Any
from pydantic import BaseModel, Field


class HackathonOut(BaseModel):
    id: Optional[str] = Field(default=None, alias="_id", description="MongoDB ObjectID hex string")
    title: str = Field(default="", description="Official hackathon title")
    link: str = Field(default="", description="Sanitized destination URL")
    source: str = Field(default="Unknown", description="Origin platform (Devfolio, Unstop, Devpost, HackerEarth, etc.)")
    deadline: Optional[str] = Field(default="TBA", description="Human-readable deadline")
    deadline_iso: Optional[str] = Field(default=None, description="ISO-8601 formatted date (YYYY-MM-DD)")
    mode: Optional[str] = Field(default="Virtual", description="Event format (Online, Offline, Hybrid)")
    location: Optional[str] = Field(default=None, description="Physical city/venue or Online")
    lat: Optional[float] = Field(default=None, description="Latitude coordinate")
    lng: Optional[float] = Field(default=None, description="Longitude coordinate")
    distance_km: Optional[float] = Field(default=None, description="Calculated Haversine distance from client location")
    tags: list[str] = Field(default_factory=list, description="Categorization and technology tags")
    prize: Optional[str] = Field(default=None, description="Raw prize pool string")
    is_top_college: Optional[bool] = Field(default=False, description="Flag for premier institutes (IIT/NIT/IIIT/BITS)")
    college_name: Optional[str] = Field(default=None, description="Name of host college/university")
    college_type: Optional[str] = Field(default=None, description="Category of premier college (IIT, NIT, IIIT, BITS)")
    is_internship: Optional[bool] = Field(default=False, description="Flag indicating PPI or hiring opportunity")
    status: Optional[str] = Field(default="Open", description="Registration status (Open, Live, Ended)")
    is_past: Optional[bool] = Field(default=False, description="Whether event registration has passed")
    total_registrations: Optional[Any] = Field(default=None, description="Total verified participants")
    registrations: Optional[Any] = Field(default=None, description="Legacy registration count alias")
    min_team_size: Optional[Any] = Field(default=None, description="Minimum team size requirement")
    max_team_size: Optional[Any] = Field(default=None, description="Maximum team size limit")
    scraped_at: Optional[str] = Field(default=None, description="ISO timestamp of discovery sweep")
    desc: Optional[str] = Field(default=None, description="Event description or theme excerpt")
    opportunity_type: Optional[str] = Field(default=None, description="Type (Hackathon, Internship, Hiring Challenge)")

    model_config = {
        "populate_by_name": True,
        "extra": "ignore",
    }


class StatsOut(BaseModel):
    total: int = Field(default=0, description="Total hackathons currently indexed")
    unique_tags: int = Field(default=0, description="Count of distinct tech/theme tags")
    sources: list[str] = Field(default_factory=list, description="List of active scraper sources")
    last_scraped: str = Field(default="", description="ISO timestamp of most recent scraper sweep")
    top_college_count: int = Field(default=0, description="Number of IIT/NIT/IIIT/BITS events")
    internship_count: int = Field(default=0, description="Number of PPI/internship opportunities")
    college_types: list[str] = Field(default_factory=list, description="Active college tiers indexed")
    online_count: int = Field(default=0, description="Count of virtual events")
    offline_count: int = Field(default=0, description="Count of in-person events")
    unique_sources_count: int = Field(default=0, description="Count from boutique/unique sources")
    hackathon_count: int = Field(default=0, description="Verified hackathons count")
    total_prize_pool_inr: float = Field(default=0.0, description="Aggregated prize pool in Indian Rupees")
    total_prize_pool_formatted: str = Field(default="₹0", description="Formatted prize pool string (Cr/Lakh)")
    total_registrations: int = Field(default=0, description="Sum of registered participants across all events")
    total_registrations_formatted: str = Field(default="0", description="Formatted registration count (e.g. 42.5k)")
    p50_latency_ms: float = Field(default=32.0, description="Median API server response latency")
    recalculated_cadence: str = Field(default="Every 3-4 hours", description="Background refresh schedule")
    calculated_at: str = Field(default="", description="ISO timestamp of statistics aggregation")


class HackathonsResponse(BaseModel):
    success: bool = Field(default=True, description="Request execution status")
    count: int = Field(default=0, description="Number of hackathons returned in this page")
    data: list[HackathonOut] = Field(default_factory=list, description="Paginated hackathon entities")
    upcoming_total: int = Field(default=0, description="Total upcoming opportunities matching filter")
    missed_total: int = Field(default=0, description="Total past opportunities matching filter")
    stats: Optional[StatsOut] = Field(default=None, description="System-wide aggregate radar telemetry")


class HealthResponse(BaseModel):
    status: str = Field(..., description="Service status ('healthy' or 'unhealthy')")
    database: Optional[str] = Field(default=None, description="MongoDB connection state")
    reason: Optional[str] = Field(default=None, description="Failure reason if degraded")


class MetricsResponse(BaseModel):
    request_count: Optional[int] = Field(default=None, description="Total requests tracked in sample window")
    p50_ms: Optional[float] = Field(default=None, description="Median latency in milliseconds")
    p95_ms: Optional[float] = Field(default=None, description="95th percentile latency in milliseconds")
    min_ms: Optional[float] = Field(default=None, description="Minimum observed latency")
    max_ms: Optional[float] = Field(default=None, description="Maximum observed latency")
    cache_ttl_seconds: Optional[int] = Field(default=None, description="Configured cache expiration time")
    cache_size: Optional[int] = Field(default=None, description="Active items in in-memory TTLCache")
    message: Optional[str] = Field(default=None, description="Notice if insufficient requests recorded")


class RefreshResponse(BaseModel):
    success: bool = Field(..., description="Whether cache purge succeeded")
    cleared: Optional[int] = Field(default=None, description="Number of cache slots evicted")
    message: Optional[str] = Field(default=None, description="Operational summary message")
    error: Optional[str] = Field(default=None, description="Error reason on rejection")
