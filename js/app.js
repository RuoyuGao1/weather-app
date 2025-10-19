const $ = (s, r=document)=>r.querySelector(s);
const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));

const state = {
  unit: "C",
  lastCoords: null,
  lastCityLabel: null,
  favorites: JSON.parse(localStorage.getItem("favorites") || "[]")
};

let hourlyChart = null;

const cfg = window.APP_CONFIG;
const cityInput = $("#city-input");
const searchForm = $("#search-form");
const currentEl = $("#current-content");
const forecastEl = $("#forecast-grid");
const unitBtn = $("#unit-btn");
const geoBtn = $("#geo-btn");
const favAddBtn = $("#fav-add-btn");
const favListEl = $("#fav-list");

const OW_GEO = q => `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(q)}&limit=1&appid=${cfg.OPENWEATHER_API_KEY}`;
const OW_CURRENT = (lat,lon) => `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${cfg.OPENWEATHER_API_KEY}`;
const OW_ICON = id => `https://openweathermap.org/img/wn/${id}@2x.png`;
const OM_DAILY = (lat,lon)=>`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=7`;
const OM_HOURLY = (lat,lon)=>`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m&forecast_days=1&timezone=auto`;

const codeToEmoji = c=>{
  if([0].includes(c)) return "☀️";
  if([1,2,3].includes(c)) return "⛅";
  if([45,48].includes(c)) return "🌫️";
  if([51,53,55,56,57].includes(c)) return "🌦️";
  if([61,63,65,66,67].includes(c)) return "🌧️";
  if([71,73,75,77,85,86].includes(c)) return "❄️";
  if([95,96,99].includes(c)) return "⛈️";
  return "☁️";
};
const c2f = c => (c*9/5)+32;
const fmtTemp = (c,u)=>u==="F"?`${Math.round(c2f(c))}°F`:`${Math.round(c)}°C`;

function setTheme(c,isNight){
  document.body.className="";
  if(isNight) return document.body.classList.add("night");
  if(c<=0) document.body.classList.add("cold");
  else if(c>=25) document.body.classList.add("warm");
}

async function getJSON(url){ const r=await fetch(url); if(!r.ok) throw new Error("Request failed"); return r.json(); }
async function geocodeCity(city){
  const arr = await getJSON(OW_GEO(city));
  if(!arr.length) throw new Error("City not found");
  const {lat, lon, name, country} = arr[0];
  return {lat, lon, label: `${name}${country ? ", "+country : ""}`};
}

async function getCurrent(lat,lon){ return getJSON(OW_CURRENT(lat,lon)); }
async function getDaily(lat,lon){ return getJSON(OM_DAILY(lat,lon)); }
async function getHourly(lat,lon){ return getJSON(OM_HOURLY(lat,lon)); }

function renderCurrent(label, j){
  const t=j.main.temp, desc=j.weather[0].description, icon=j.weather[0].icon;
  const hum=j.main.humidity, wind=j.wind.speed;
  const tz=j.timezone, local=new Date(Date.now()+tz*1000);
  const hour=local.getUTCHours();
  const isNight=icon.endsWith("n") || hour<6 || hour>=20;
  setTheme(t,isNight);
  currentEl.innerHTML=`
    <div class="current-wrap">
      <img src="${OW_ICON(icon)}" alt="">
      <div>
        <div class="current-temp">${fmtTemp(t,state.unit)}</div>
        <div>${desc} • ${label}</div>
        <div class="current-meta">Humidity: ${hum}% | Wind: ${Math.round(wind)} m/s</div>
      </div>
    </div>`;
}

function renderForecast(daily){
  const d=daily.daily;
  forecastEl.innerHTML=d.time.map((ds,i)=>`
    <div class="day">
      <div class="weekday">${new Date(ds).toLocaleDateString("en-US",{weekday:"short"})}</div>
      <div class="emoji">${codeToEmoji(d.weathercode[i])}</div>
      <div class="tmax">${fmtTemp(d.temperature_2m_max[i],state.unit)}</div>
      <div class="tmin">${fmtTemp(d.temperature_2m_min[i],state.unit)}</div>
    </div>`).join("");
}

function renderHourlyChart(hours, temps) {
  const ctx = document.getElementById("hourlyChart").getContext("2d");
  if (hourlyChart) hourlyChart.destroy();
  const data = state.unit === "F" ? temps.map(c => (c * 9) / 5 + 32) : temps;
  const label = state.unit === "F" ? "Temperature (°F)" : "Temperature (°C)";
  hourlyChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: hours,
      datasets: [{
        label,
        data,
        borderWidth: 2,
        tension: 0.3,
        pointRadius: 0,
        borderColor: "#38bdf8",
        fill: false,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { title: { display: true, text: "Hour" } },
        y: { title: { display: true, text: label } }
      }
    }
  });
}

async function loadByCoords(lat,lon,label=""){
  state.lastCoords={lat,lon};
  try{
    const [cw,fd,hd]=await Promise.all([getCurrent(lat,lon),getDaily(lat,lon),getHourly(lat,lon)]);
    renderCurrent(label,cw);
    renderForecast(fd);
    const hours = hd.hourly.time.map(t => new Date(t).getHours());
    const temps = hd.hourly.temperature_2m;
    renderHourlyChart(hours, temps);
  }catch(e){currentEl.textContent=e.message; forecastEl.innerHTML="";}
}

async function handleSearch(city){
  try{
    const g=await geocodeCity(city);
    state.lastCityLabel=g.label;
    await loadByCoords(g.lat,g.lon,g.label);
  }catch(e){currentEl.textContent=e.message;}
}

function renderFavorites(){
  favListEl.innerHTML="";
  state.favorites.forEach(c=>{
    const b=document.createElement("button");
    b.className="chip"; b.textContent=c;
    b.onclick=()=>handleSearch(c);
    favListEl.appendChild(b);
  });
}

function addFavorite(){
  if(!state.lastCityLabel) return;
  if(!state.favorites.includes(state.lastCityLabel)){
    state.favorites.push(state.lastCityLabel);
    localStorage.setItem("favorites",JSON.stringify(state.favorites));
    renderFavorites();
  }
}

searchForm.onsubmit=e=>{e.preventDefault();handleSearch(cityInput.value.trim());};
unitBtn.onclick=()=>{state.unit=state.unit==="C"?"F":"C";unitBtn.textContent=state.unit==="C"?"°C":"°F";if(state.lastCoords)loadByCoords(state.lastCoords.lat,state.lastCoords.lon,state.lastCityLabel);};
geoBtn.onclick=()=>{navigator.geolocation.getCurrentPosition(async p=>{await loadByCoords(p.coords.latitude,p.coords.longitude,"My location");});};
favAddBtn.onclick=addFavorite;

renderFavorites();
handleSearch("Lahti");
