const axios = require("axios");

async function getAddress(lat, lng) {
  const apiKey = "AIzaSyAXGPQ4vEaT4iJ0XDR5Rtl5lttvFpxsVpU"; // Replace with your key
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`;

  const response = await axios.get(url);
  if (response.data.results.length > 0) {
    console.log("Address:", response.data.results[0].formatted_address);
  } else {
    console.log("No address found.");
  }
}

getAddress(22.552417, 72.923694);
