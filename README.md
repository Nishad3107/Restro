# 🍛 Royal Rasoi

**Royal Rasoi** is a front-end web application for a premium authentic Indian restaurant. The project features a beautifully designed, responsive single-page architecture that allows users to browse a dynamic menu, manage their cart, and proceed to a seamless checkout experience.

## ✨ Features

- **Single Page Application (SPA) feel:** Smooth transitions between the Menu, Cart, Checkout, and Confirmation pages using pure DOM manipulation without full page reloads.
- **Dynamic Cart Management:** Users can add items, adjust quantities, and remove items from their cart, with real-time updates to subtotals, taxes, and total pricing.
- **Responsive UI/UX:** A mobile-friendly design using responsive grids, providing a great experience on both desktop and mobile devices.
- **Interactive Forms & Validation:** A comprehensive checkout form capturing delivery and payment information.
- **Live Location Integration:** Includes a Google Maps API integration to fetch and autofill the user's delivery address.
- **Firebase Integration (Ready):** Contains the setup for Firebase Firestore, preparing the app for backend database operations like storing orders in real-time.

## 🛠️ Technologies Used

- **HTML5 & CSS3:** Semantic markup with custom, modern CSS styling (animations, gradients, glassmorphism UI elements).
- **Vanilla JavaScript:** Handles all application logic, state management (cart), and page routing.
- **Firebase SDK (v8.10.1):** Set up for real-time cloud database (Firestore) to handle order placements and data persistence.
- **Google Maps Places API:** Used for mapping and fetching user live locations for delivery.

## 🚀 Getting Started

Follow these steps to run the application locally on your machine.

### Prerequisites

Since this is a static web application, you just need a modern web browser. However, to run it without CORS issues (especially with Firebase/Maps APIs), it's recommended to serve it via a local web server.

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/royal-rasoi.git
