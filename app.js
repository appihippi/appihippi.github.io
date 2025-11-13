// app.js
import { firebaseConfig } from "./firebase-config.js";
import { distanceMeters } from "./utils.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

// === Firebase init ===
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// === DOM refs ===
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const userAvatar = document.getElementById("userAvatar");

const tabs = document.querySelectorAll(".tab");
const screens = {
  home: document.getElementById("home"),
  addTodo: document.getElementById("addTodo"),
  places: document.getElementById("places"),
  addPlace: document.getElementById("addPlace"),
  settings: document.getElementById("settings")
};

const nearbyBanner = document.getElementById("nearbyBanner");
const nearbyText = document.getElementById("nearbyText");
const nearbyViewBtn = document.getElementById("nearbyViewBtn");

const todoListEl = document.getElementById("todoList");
const placeListEl = document.getElementById("placeList");

const addTodoBtn = document.getElementById("addTodoBtn");
const addPlaceBtn = document.getElementById("addPlaceBtn");
const useCurrentLocationBtn = document.getElementById("useCurrentLocationBtn");

// Add Todo inputs
const todoTitleInput = document.getElementById("todoTitle");
const todoDescInput = document.getElementById("todoDesc");
const todoActionSelect = document.getElementById("todoAction");
const todoDateSelect = document.getElementById("todoDate");
const todoPriorityInput = document.getElementById("todoPriority");
const priorityValue = document.getElementById("priorityValue");
const todoTagsInput = document.getElementById("todoTags");
const todoPlaceSelect = document.getElementById("todoPlaceSelect");
const saveTodoBtn = document.getElementById("saveTodoBtn");
const cancelTodoBtn = document.getElementById("cancelTodoBtn");

// Add Place inputs
const placeNameInput = document.getElementById("placeName");
const placeAddressInput = document.getElementById("placeAddress");
const placeLatInput = document.getElementById("placeLat");
const placeLngInput = document.getElementById("placeLng");
const placeRadiusInput = document.getElementById("placeRadius");
const savePlaceBtn = document.getElementById("savePlaceBtn");
const cancelPlaceBtn = document.getElementById("cancelPlaceBtn");

// Filters
const filterButtons = document.querySelectorAll(".filter");

// Settings
const userEmailEl = document.getElementById("userEmail");
const permLocationEl = document.getElementById("permLocation");
const permNotificationsEl = document.getElementById("permNotifications");

// === State ===
let currentUser = null;
let todos = [];
let places = [];
let currentFilter = "today";
let lastLocation = null;
let nearbyTodos = [];
let locationWatchId = null;

// === Screen / nav helpers ===

function showScreen(name) {
  Object.entries(screens).forEach(([id, el]) =>
    el.classList.toggle("active", id === name)
  );
  tabs.forEach(tab =>
    tab.classList.toggle("active", tab.dataset.screen === name)
  );
}

function resetAddTodoForm() {
  todoTitleInput.value = "";
  todoDescInput.value = "";
  todoActionSelect.value = "buy";
  todoDateSelect.value = "this_week";
  todoPriorityInput.value = 3;
  priorityValue.textContent = "3";
  todoTagsInput.value = "";
  if (todoPlaceSelect.options.length > 0) {
    todoPlaceSelect.selectedIndex = 0;
  }
}

function resetAddPlaceForm() {
  placeNameInput.value = "";
  placeAddressInput.value = "";
  placeLatInput.value = "";
  placeLngInput.value = "";
  placeRadiusInput.value = 300;
}

// Auth UI

function updateAuthUI() {
  if (currentUser) {
    loginBtn.classList.add("hidden");
    logoutBtn.classList.remove("hidden");
    userEmailEl.textContent = currentUser.email || currentUser.uid;

    if (currentUser.photoURL) {
      userAvatar.src = currentUser.photoURL;
      userAvatar.classList.remove("hidden");
    } else {
      userAvatar.classList.add("hidden");
    }
  } else {
    loginBtn.classList.remove("hidden");
    logoutBtn.classList.add("hidden");
    userAvatar.classList.add("hidden");
    userEmailEl.textContent = "Not logged in";
  }
}

// Firestore paths

function userTodosCol(uid) {
  return collection(db, "users", uid, "todos");
}

function userPlacesCol(uid) {
  return collection(db, "users", uid, "places");
}

// Load data

async function loadPlaces() {
  if (!currentUser) return;
  const snap = await getDocs(userPlacesCol(currentUser.uid));
  places = [];
  snap.forEach(docSnap => places.push({ id: docSnap.id, ...docSnap.data() }));
  renderPlaces();
  fillPlaceSelect();
}

async function loadTodos() {
  if (!currentUser) return;
  const snap = await getDocs(userTodosCol(currentUser.uid));
  todos = [];
  snap.forEach(docSnap => todos.push({ id: docSnap.id, ...docSnap.data() }));
  renderTodos();
}

// Render

function renderPlaces() {
  placeListEl.innerHTML = "";
  if (!places.length) {
    placeListEl.innerHTML =
      '<div class="card card-sub">No places yet. Tap “Use Current Location” or + to add one.</div>';
    return;
  }

  places.forEach(p => {
    const lat = p.geo?.lat ?? p.lat;
    const lng = p.geo?.lng ?? p.lng;
    const radius = p.radiusMeters || p.radius || 300;

    const el = document.createElement("div");
    el.className = "card";
    el.innerHTML = `
      <div class="card-title">${p.name}</div>
      <div class="card-sub">${p.address || ""}</div>
      <div class="card-meta">
        Lat: ${lat?.toFixed ? lat.toFixed(5) : lat},
        Lng: ${lng?.toFixed ? lng.toFixed(5) : lng} •
        Radius: ${radius}m
      </div>
    `;
    placeListEl.appendChild(el);
  });
}

function fillPlaceSelect() {
  todoPlaceSelect.innerHTML = "";
  if (!places.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No places (add one first)";
    todoPlaceSelect.appendChild(opt);
    return;
  }
  places.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    todoPlaceSelect.appendChild(opt);
  });
}

function isTodoActiveForDate(todo, filter) {
  if (filter === "all" || filter === "nearby") return true;

  const bucket = todo.dateBucket || "eventually";

  if (filter === "today") {
    return bucket === "today";
  }
  if (filter === "this_week") {
    return ["today", "tomorrow", "soon", "this_week"].includes(bucket);
  }
  if (filter === "this_month") {
    return ["today", "tomorrow", "soon", "this_week", "this_month"].includes(
      bucket
    );
  }
  return true;
}

function renderTodos(listOverride = null) {
  const list = listOverride || todos;
  todoListEl.innerHTML = "";

  if (!currentUser) {
    todoListEl.innerHTML =
      '<div class="card card-sub">Sign in to view your todos.</div>';
    return;
  }
  if (!list.length) {
    todoListEl.innerHTML =
      '<div class="card card-sub">No todos yet. Tap + to add one.</div>';
    return;
  }

  const filtered = list.filter(t => !t.isDone && isTodoActiveForDate(t, currentFilter));

  if (!filtered.length) {
    todoListEl.innerHTML =
      '<div class="card card-sub">No todos for this filter.</div>';
    return;
  }

  filtered
    .slice()
    .sort((a, b) => (b.priority || 1) - (a.priority || 1))
    .forEach(t => {
      const place = places.find(p => p.id === t.placeId);
      const placeLabel = place ? place.name : "No place";

      const tagsText =
        t.tags && t.tags.length ? "Tags: " + t.tags.join(", ") : "";

      const el = document.createElement("div");
      el.className = "card";
      el.dataset.id = t.id;
      el.innerHTML = `
        <div class="card-title">${t.title}</div>
        <div class="card-sub">
          Action: ${t.actionType?.toUpperCase() || ""} •
          Date: ${t.dateBucket || ""} •
          Priority: ${t.priority || 1}
        </div>
        <div class="card-meta">
          Place: ${placeLabel}${tagsText ? " • " + tagsText : ""}
        </div>
      `;

      el.addEventListener("click", () => {
        toggleTodoDone(t.id);
      });

      todoListEl.appendChild(el);
    });
}

// CRUD: Todos

async function saveNewTodo() {
  if (!currentUser) return;
  const title = todoTitleInput.value.trim();
  if (!title) {
    alert("Title is required");
    return;
  }

  const desc = todoDescInput.value.trim();
  const actionType = todoActionSelect.value;
  const dateBucket = todoDateSelect.value;
  const priority = parseInt(todoPriorityInput.value, 10) || 1;

  const tags = todoTagsInput.value
    .split(",")
    .map(t => t.trim())
    .filter(Boolean);

  const placeId = todoPlaceSelect.value || null;

  const data = {
    title,
    description: desc,
    actionType,
    dateBucket,
    priority,
    tags,
    placeId,
    isDone: false,
    createdAt: serverTimestamp()
  };

  await addDoc(userTodosCol(currentUser.uid), data);
  resetAddTodoForm();
  showScreen("home");
  await loadTodos();
}

async function toggleTodoDone(id) {
  if (!currentUser) return;
  const todo = todos.find(t => t.id === id);
  if (!todo) return;
  const ref = doc(db, "users", currentUser.uid, "todos", id);
  await updateDoc(ref, { isDone: !todo.isDone });
  await loadTodos();
}

// CRUD: Places

async function saveNewPlace() {
  if (!currentUser) return;
  const name = placeNameInput.value.trim();
  if (!name) {
    alert("Name is required");
    return;
  }
  const address = placeAddressInput.value.trim();
  const lat = parseFloat(placeLatInput.value);
  const lng = parseFloat(placeLngInput.value);
  const radiusMeters = parseInt(placeRadiusInput.value, 10) || 300;

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    alert("Latitude and Longitude are required");
    return;
  }

  const data = {
    name,
    address,
    geo: { lat, lng },
    radiusMeters,
    createdAt: serverTimestamp()
  };

  await addDoc(userPlacesCol(currentUser.uid), data);
  resetAddPlaceForm();
  showScreen("places");
  await loadPlaces();
}

// Filters

filterButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    filterButtons.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;

    if (currentFilter === "nearby") {
      if (!lastLocation) {
        requestLocationOnce();
      } else {
        computeNearbyTodos();
      }
      renderTodos(nearbyTodos);
    } else {
      renderTodos();
    }
  });
});

// Location

function getCurrentPositionPromise() {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Geolocation not supported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude
        });
      },
      err => reject(err),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

async function requestLocationOnce() {
  try {
    const pos = await getCurrentPositionPromise();
    lastLocation = pos;
    updateLocationPermissionStatus("granted");
    computeNearbyTodos();
  } catch (e) {
    console.warn("Location error", e);
    updateLocationPermissionStatus("denied/blocked");
  }
}

function startLocationWatch() {
  if (!("geolocation" in navigator)) {
    updateLocationPermissionStatus("unsupported");
    return;
  }
  if (locationWatchId != null) return;

  locationWatchId = navigator.geolocation.watchPosition(
    pos => {
      lastLocation = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude
      };
      computeNearbyTodos();
    },
    err => {
      console.warn("watchPosition error", err);
    },
    { enableHighAccuracy: true, maximumAge: 30000, timeout: 20000 }
  );
}

function stopLocationWatch() {
  if (locationWatchId != null && navigator.geolocation) {
    navigator.geolocation.clearWatch(locationWatchId);
    locationWatchId = null;
  }
}

function computeNearbyTodos() {
  nearbyTodos = [];
  if (!lastLocation || !places.length || !todos.length) {
    hideNearbyBanner();
    return;
  }

  const activeTodos = todos.filter(t => !t.isDone);
  const result = [];

  activeTodos.forEach(t => {
    const place = places.find(p => p.id === t.placeId);
    if (!place || !place.geo) return;

    const dist = distanceMeters(
      { lat: lastLocation.lat, lng: lastLocation.lng },
      { lat: place.geo.lat, lng: place.geo.lng }
    );
    const radius = place.radiusMeters || 300;

    if (dist <= radius) {
      result.push({ todo: t, place, distance: Math.round(dist) });
    }
  });

  nearbyTodos = result.map(r => r.todo);

  if (nearbyTodos.length) {
    const top = result[0];
    showNearbyBanner(top.place, result.length);
    maybeShowNotification(top.place, result.length);
  } else {
    hideNearbyBanner();
  }

  if (currentFilter === "nearby") {
    renderTodos(nearbyTodos);
  }
}

// Banner & Notifications

function showNearbyBanner(place, count) {
  nearbyText.textContent = `You're near ${place.name}. ${count} todo(s) need attention here.`;
  nearbyBanner.classList.remove("hidden");
}

function hideNearbyBanner() {
  nearbyBanner.classList.add("hidden");
}

nearbyViewBtn.addEventListener("click", () => {
  currentFilter = "nearby";
  filterButtons.forEach(b =>
    b.classList.toggle("active", b.dataset.filter === "nearby")
  );
  renderTodos(nearbyTodos);
});

async function maybeShowNotification(place, count) {
  if (!("Notification" in window)) {
    updateNotificationPermissionStatus("unsupported");
    return;
  }

  if (Notification.permission === "default") {
    const perm = await Notification.requestPermission();
    updateNotificationPermissionStatus(perm);
  }

  if (Notification.permission !== "granted") {
    updateNotificationPermissionStatus(Notification.permission);
    return;
  }

  updateNotificationPermissionStatus("granted");

  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return;

  reg.showNotification("GeoTodo", {
    body: `You're near ${place.name}. ${count} todo(s) need attention.`,
    icon: "icons/icon-192.png",
    tag: "geotodo-nearby"
  });
}

// Permissions UI helpers

function updateLocationPermissionStatus(status) {
  permLocationEl.textContent = status;
}

function updateNotificationPermissionStatus(status) {
  permNotificationsEl.textContent = status;
}

// Auth handlers

loginBtn.addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    console.error("Login error", e);
    alert("Login failed. Check console for details.");
  }
});

logoutBtn.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (e) {
    console.error("Logout error", e);
  }
});

// Tabs

tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    const target = tab.dataset.screen;
    showScreen(target);
  });
});

// Screen buttons

addTodoBtn.addEventListener("click", () => {
  resetAddTodoForm();
  showScreen("addTodo");
});

addPlaceBtn.addEventListener("click", () => {
  resetAddPlaceForm();
  showScreen("addPlace");
});

saveTodoBtn.addEventListener("click", () => {
  saveNewTodo().catch(err => {
    console.error("Save todo error", err);
    alert("Failed to save todo.");
  });
});

cancelTodoBtn.addEventListener("click", () => {
  resetAddTodoForm();
  showScreen("home");
});

savePlaceBtn.addEventListener("click", () => {
  saveNewPlace().catch(err => {
    console.error("Save place error", err);
    alert("Failed to save place.");
  });
});

cancelPlaceBtn.addEventListener("click", () => {
  resetAddPlaceForm();
  showScreen("places");
});

// Use current location for new place

useCurrentLocationBtn.addEventListener("click", async () => {
  try {
    const pos = await getCurrentPositionPromise();
    placeLatInput.value = pos.lat;
    placeLngInput.value = pos.lng;
    placeNameInput.value = "Current Location";
    updateLocationPermissionStatus("granted");
    showScreen("addPlace");
    alert("Location detected! Latitude and longitude filled.");
  } catch (err) {
    console.error(err);
    updateLocationPermissionStatus("denied/blocked");
    alert("Unable to access your location. Check permissions.");
  }
});

// Priority slider text

todoPriorityInput.addEventListener("input", () => {
  priorityValue.textContent = todoPriorityInput.value;
});

// Auth state

onAuthStateChanged(auth, async user => {
  currentUser = user;
  updateAuthUI();

  if (user) {
    await Promise.all([loadPlaces(), loadTodos()]);
    requestLocationOnce();
    startLocationWatch();
  } else {
    stopLocationWatch();
    todos = [];
    places = [];
    renderTodos();
    renderPlaces();
    hideNearbyBanner();
  }
});

// Initial permission display

(function initPermissionStatus() {
  if ("Notification" in window) {
    updateNotificationPermissionStatus(Notification.permission);
  } else {
    updateNotificationPermissionStatus("unsupported");
  }

  if (!("permissions" in navigator) || !navigator.permissions.query) {
    updateLocationPermissionStatus("unknown");
    return;
  }

  navigator.permissions
    .query({ name: "geolocation" })
    .then(result => {
      updateLocationPermissionStatus(result.state);
      result.onchange = () => updateLocationPermissionStatus(result.state);
    })
    .catch(() => {
      updateLocationPermissionStatus("unknown");
    });
})();
