const API_KEY = "048fe421b4dd58a90d380f93aca7a4aa";
const BASE_URL = "https://api.themoviedb.org/3";
const IMAGE_BASE = "https://image.tmdb.org/t/p/w500";
const MAX_TMDB_PAGE = 500;

const moviesContainer = document.getElementById("movies");
const searchForm = document.getElementById("search-form");
const searchInput = document.getElementById("search-input");
const prevBtn = document.getElementById("prev-btn");
const nextBtn = document.getElementById("next-btn");
const pageInfo = document.getElementById("page-info");
const trailerModal = document.getElementById("trailer-modal");
const closeTrailerBtn = document.getElementById("close-trailer");
const trailerTitle = document.getElementById("trailer-title");
const trailerBody = document.getElementById("trailer-body");

// ── Filter UI refs ────────────────────────────────────
const filterToggleBtn  = document.getElementById("filter-toggle");
const filterBar        = document.getElementById("filter-bar");
const filterActiveDot  = document.getElementById("filter-active-dot");
const genreChipsEl     = document.getElementById("genre-chips");
const industryChipsEl  = document.getElementById("industry-chips");
const sortSelect       = document.getElementById("sort-select");
const yearSelect       = document.getElementById("year-select");
const ratingSelect     = document.getElementById("rating-select");
const clearFiltersBtn  = document.getElementById("clear-filters");

let currentPage = 1;
let totalPages = 1;
let currentQuery = "";
const trailerCache = new Map();

// ── Filter state ──────────────────────────────────────
const filters = {
  genreId:   "",          // TMDB genre id string or ""
  sortBy:    "popularity.desc",
  year:      "",
  minRating: "",
  language:  "",          // original_language code ("en", "hi", "te", etc.)
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Returns true if any non-default filter is set
function hasActiveFilters() {
  return (
    filters.genreId   !== "" ||
    filters.sortBy    !== "popularity.desc" ||
    filters.year      !== "" ||
    filters.minRating !== "" ||
    filters.language  !== ""
  );
}

function getEndpoint(page, query) {
  // With a search query: use /search/movie (only sortBy is supported)
  if (query) {
    let url = `${BASE_URL}/search/movie?api_key=${API_KEY}&query=${encodeURIComponent(query)}&page=${page}&include_adult=false`;
    if (filters.sortBy)   url += `&sort_by=${filters.sortBy}`;
    if (filters.language) url += `&language=en-US&with_original_language=${filters.language}`;
    return url;
  }

  // No query: use /discover/movie with full filter support
  let url = `${BASE_URL}/discover/movie?api_key=${API_KEY}&page=${page}&include_adult=false`;
  url += `&sort_by=${filters.sortBy || "popularity.desc"}`;
  if (filters.genreId)   url += `&with_genres=${filters.genreId}`;
  if (filters.year)      url += `&primary_release_year=${filters.year}`;
  if (filters.minRating) url += `&vote_average.gte=${filters.minRating}&vote_count.gte=50`;
  if (filters.language)  url += `&with_original_language=${filters.language}`;
  return url;
}

function createMovieCard(movie) {
  const movieId = Number.isFinite(movie.id) ? movie.id : "";
  const posterPath = movie.poster_path
    ? `${IMAGE_BASE}${movie.poster_path}`
    : "https://via.placeholder.com/500x750/141824/525d75?text=No+Image";
  const year = movie.release_date ? movie.release_date.slice(0, 4) : "N/A";
  const rating = Number.isFinite(movie.vote_average)
    ? movie.vote_average.toFixed(1)
    : "N/A";
  const safeTitle = escapeHtml(movie.title || "Untitled");

  return `
    <article class="movie-card">
      <div class="poster-wrapper">
        <img class="poster" src="${posterPath}" alt="${safeTitle} poster" loading="lazy">
      </div>
      <div class="movie-content">
        <h3 class="movie-title">${safeTitle}</h3>
        <div class="movie-meta">
          <span class="movie-rating">${rating}</span>
          <span class="movie-year">${year}</span>
        </div>
        <button
          class="trailer-btn"
          type="button"
          data-movie-id="${movieId}"
          data-movie-title="${safeTitle}"
        >
          Watch Trailer
        </button>
      </div>
    </article>
  `;
}

const resultsLabel = document.getElementById("results-label");

function getResultsLabelText() {
  if (currentQuery) return `Results for "${currentQuery}"`;
  if (filters.genreId || filters.year || filters.minRating || filters.language || filters.sortBy !== "popularity.desc") {
    return "Filtered Movies";
  }
  return "Popular Right Now";
}

function renderMovies(movies) {
  if (!movies.length) {
    moviesContainer.innerHTML = '<p class="empty"><span class="empty-icon">🎬</span>No movies found. Try adjusting your filters.</p>';
    return;
  }

  moviesContainer.innerHTML = movies.map(createMovieCard).join("");
}

function updatePagination() {
  pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
  prevBtn.disabled = currentPage <= 1;
  nextBtn.disabled = currentPage >= totalPages;
}

function openTrailerModal(titleText) {
  trailerTitle.textContent = `${titleText} Trailer`;
  trailerBody.innerHTML = '<div class="trailer-placeholder">Loading trailer...</div>';
  trailerModal.classList.add("open");
  trailerModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function closeTrailerModal() {
  trailerModal.classList.remove("open");
  trailerModal.setAttribute("aria-hidden", "true");
  trailerBody.innerHTML = "";
  document.body.classList.remove("modal-open");
}

function selectBestTrailer(videos) {
  const youtubeVideos = videos.filter(
    (video) => video.site === "YouTube" && video.key
  );

  if (!youtubeVideos.length) {
    return null;
  }

  const officialTrailer = youtubeVideos.find(
    (video) => video.type === "Trailer" && video.official
  );
  const trailer = youtubeVideos.find((video) => video.type === "Trailer");
  const teaser = youtubeVideos.find((video) => video.type === "Teaser");

  return officialTrailer || trailer || teaser || youtubeVideos[0];
}

async function fetchTrailer(movieId) {
  if (trailerCache.has(movieId)) {
    return trailerCache.get(movieId);
  }

  const endpoint = `${BASE_URL}/movie/${movieId}/videos?api_key=${API_KEY}&language=en-US`;
  const response = await fetch(endpoint);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();
  const trailer = selectBestTrailer(data.results || []);
  trailerCache.set(movieId, trailer);

  return trailer;
}

function renderTrailer(trailer, movieTitle) {
  if (!trailer) {
    trailerBody.innerHTML =
      '<div class="trailer-placeholder">Trailer not available for this movie.</div>';
    return;
  }

  const safeTitle = escapeHtml(movieTitle || "Movie");
  const embedUrl = `https://www.youtube.com/embed/${encodeURIComponent(
    trailer.key
  )}?autoplay=1&rel=0`;

  trailerBody.innerHTML = `
    <iframe
      src="${embedUrl}"
      title="${safeTitle} trailer"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowfullscreen
    ></iframe>
  `;
}

async function fetchMovies(page = 1, query = "") {
  moviesContainer.innerHTML = '<p class="empty">Loading movies...</p>';

  // Update section label
  if (resultsLabel) resultsLabel.textContent = getResultsLabelText();

  try {
    const endpoint = getEndpoint(page, query);
    const response = await fetch(endpoint);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const rawPages = Number.isFinite(data.total_pages) ? data.total_pages : 1;

    currentPage = page;
    totalPages = Math.max(1, Math.min(rawPages, MAX_TMDB_PAGE));
    renderMovies(data.results || []);
    updatePagination();
  } catch (error) {
    moviesContainer.innerHTML = `<p class="empty">Failed to load movies. ${error.message}</p>`;
    totalPages = 1;
    updatePagination();
  }
}

// ── Genre helpers ─────────────────────────────────────
async function fetchGenres() {
  try {
    const res = await fetch(`${BASE_URL}/genre/movie/list?api_key=${API_KEY}&language=en-US`);
    if (!res.ok) return;
    const data = await res.json();
    buildGenreChips(data.genres || []);
  } catch (_) { /* silently ignore */ }
}

function buildGenreChips(genres) {
  if (!genreChipsEl) return;
  const currentYear = new Date().getFullYear();

  // Populate year dropdown (current year → 1970)
  if (yearSelect) {
    for (let y = currentYear; y >= 1970; y--) {
      const opt = document.createElement("option");
      opt.value = String(y);
      opt.textContent = String(y);
      yearSelect.appendChild(opt);
    }
  }

  // Add genre chips after the "All" chip
  genres.forEach(({ id, name }) => {
    const btn = document.createElement("button");
    btn.className = "genre-chip";
    btn.type = "button";
    btn.dataset.genreId = String(id);
    btn.textContent = name;
    genreChipsEl.appendChild(btn);
  });
}

function updateFilterIndicator() {
  const active = hasActiveFilters();
  if (filterActiveDot)  filterActiveDot.hidden  = !active;
  if (filterToggleBtn)  filterToggleBtn.classList.toggle("active", active);
  if (clearFiltersBtn)  clearFiltersBtn.hidden   = !active;
}

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  currentQuery = searchInput.value.trim();
  fetchMovies(1, currentQuery);
});

// ── Filter Toggle Panel ───────────────────────────────
if (filterToggleBtn && filterBar) {
  filterToggleBtn.addEventListener("click", () => {
    const isOpen = filterBar.classList.toggle("open");
    filterToggleBtn.setAttribute("aria-expanded", String(isOpen));
    filterBar.setAttribute("aria-hidden", String(!isOpen));
  });
}

// ── Genre chip selection ──────────────────────────────
if (genreChipsEl) {
  genreChipsEl.addEventListener("click", (e) => {
    const chip = e.target.closest(".genre-chip");
    if (!chip) return;
    genreChipsEl.querySelectorAll(".genre-chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    filters.genreId = chip.dataset.genreId || "";
    updateFilterIndicator();
    fetchMovies(1, currentQuery);
  });
}

// ── Industry chip selection ───────────────────────────
if (industryChipsEl) {
  industryChipsEl.addEventListener("click", (e) => {
    const chip = e.target.closest(".industry-chip");
    if (!chip) return;
    industryChipsEl.querySelectorAll(".industry-chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    filters.language = chip.dataset.lang || "";
    updateFilterIndicator();
    fetchMovies(1, currentQuery);
  });
}

// ── Sort, Year, Rating selects ────────────────────────
if (sortSelect) {
  sortSelect.addEventListener("change", () => {
    filters.sortBy = sortSelect.value;
    updateFilterIndicator();
    fetchMovies(1, currentQuery);
  });
}

if (yearSelect) {
  yearSelect.addEventListener("change", () => {
    filters.year = yearSelect.value;
    updateFilterIndicator();
    fetchMovies(1, currentQuery);
  });
}

if (ratingSelect) {
  ratingSelect.addEventListener("change", () => {
    filters.minRating = ratingSelect.value;
    updateFilterIndicator();
    fetchMovies(1, currentQuery);
  });
}

// ── Clear all filters ─────────────────────────────────
if (clearFiltersBtn) {
  clearFiltersBtn.addEventListener("click", () => {
    filters.genreId   = "";
    filters.sortBy    = "popularity.desc";
    filters.year      = "";
    filters.minRating = "";
    filters.language  = "";

    // Reset UI
    if (sortSelect)   sortSelect.value   = "popularity.desc";
    if (yearSelect)   yearSelect.value   = "";
    if (ratingSelect) ratingSelect.value = "";
    genreChipsEl?.querySelectorAll(".genre-chip").forEach((c, i) => {
      c.classList.toggle("active", i === 0);
    });
    industryChipsEl?.querySelectorAll(".industry-chip").forEach((c, i) => {
      c.classList.toggle("active", i === 0);
    });

    updateFilterIndicator();
    fetchMovies(1, currentQuery);
  });
}

moviesContainer.addEventListener("click", async (event) => {
  const trailerButton = event.target.closest(".trailer-btn");
  if (!trailerButton) {
    return;
  }

  const movieId = Number(trailerButton.dataset.movieId);
  const movieTitle = trailerButton.dataset.movieTitle || "Movie";

  if (!movieId) {
    return;
  }

  openTrailerModal(movieTitle);

  try {
    const trailer = await fetchTrailer(movieId);
    renderTrailer(trailer, movieTitle);
  } catch (error) {
    trailerBody.innerHTML = `<div class="trailer-placeholder">Could not load trailer. ${escapeHtml(
      error.message
    )}</div>`;
  }
});

prevBtn.addEventListener("click", () => {
  if (currentPage > 1) {
    fetchMovies(currentPage - 1, currentQuery);
  }
});

nextBtn.addEventListener("click", () => {
  if (currentPage < totalPages) {
    fetchMovies(currentPage + 1, currentQuery);
  }
});

closeTrailerBtn.addEventListener("click", closeTrailerModal);

trailerModal.addEventListener("click", (event) => {
  if (event.target === trailerModal) {
    closeTrailerModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && trailerModal.classList.contains("open")) {
    closeTrailerModal();
  }
});

// ── Startup ───────────────────────────────────────────
// Fetch genres (populates chips + year dropdown) and
// load the initial movie list in parallel.
fetchGenres();
fetchMovies();

// ── Scroll-to-top button ──────────────────────────────
const scrollTopBtn = document.getElementById("scroll-top");
if (scrollTopBtn) {
  window.addEventListener("scroll", () => {
    scrollTopBtn.classList.toggle("visible", window.scrollY > 320);
  }, { passive: true });

  scrollTopBtn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}
