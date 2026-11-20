import {
  Sprout,
  CloudSun,
  Stethoscope,
  MessageCircle,
  ArrowUpRight,
  Sun,
  Droplets,
  Leaf,
  Lightbulb,
} from "lucide-react";

function Dashboard({ onNavigate }) {
  const features = [
    {
      id: "crop",
      title: "Crop Doctor",
      description: "Identify crop problems and explore helpful guidance.",
      icon: Stethoscope,
      color: "green",
      action: "Explore Crop Doctor",
    },
    {
      id: "weather",
      title: "Weather Alert",
      description: "Check weather information and prepare for changing conditions.",
      icon: CloudSun,
      color: "orange",
      action: "Check Weather",
    },
    {
      id: "chat",
      title: "Ask Kisan AI",
      description: "Get assistance with your everyday farming questions.",
      icon: MessageCircle,
      color: "blue",
      action: "Ask a Question",
    },
  ];

  return (
    <div className="dashboard">
      <section className="welcome-section">
        <div>
          <span className="eyebrow">
            <Sprout size={16} /> YOUR SMART FARMING COMPANION
          </span>
          <h1>Namaste, Kisan! 🌱</h1>
          <p>
            Welcome to KisanMitra AI. Your smart companion for better farming
            decisions.
          </p>
        </div>
        <div className="welcome-decoration"><Sprout size={100} /></div>
      </section>

      <section className="weather-summary">
        <div className="weather-heading">
          <div>
            <span className="section-label">WEATHER OVERVIEW</span>
            <h2>Today's Weather</h2>
            <p>Sample weather information — not a live forecast</p>
          </div>
          <CloudSun size={45} />
        </div>

        <div className="weather-details">
          <div className="temperature">
            <Sun size={30} />
            <strong>28°C</strong>
            <span>Partly Cloudy</span>
          </div>
          <div className="weather-stat">
            <Droplets size={21} />
            <span>Humidity</span>
            <strong>65%</strong>
          </div>
          <div className="weather-stat">
            <CloudSun size={21} />
            <span>Conditions</span>
            <strong>Moderate</strong>
          </div>
        </div>

        <button className="weather-button" onClick={() => onNavigate("weather")}>
          View Weather <ArrowUpRight size={17} />
        </button>
      </section>

      <section className="features-section">
        <div className="section-heading">
          <div>
            <span className="section-label">SMART FARMING TOOLS</span>
            <h2>Your Farming Assistant</h2>
          </div>
        </div>

        <div className="feature-grid">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <article className="feature-card" key={feature.id}>
                <div className={`feature-icon ${feature.color}`}>
                  <Icon size={27} />
                </div>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
                <button
                  className="feature-button"
                  onClick={() => onNavigate(feature.id)}
                >
                  {feature.action} <ArrowUpRight size={17} />
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <section className="tips-section">
        <div className="tips-icon"><Lightbulb size={27} /></div>
        <div>
          <span className="section-label">KISAN KNOWLEDGE</span>
          <h2>Today's Farming Tip</h2>
          <p>
            Check soil moisture before irrigation. Water requirements depend
            on your crop, soil type, and local weather.
          </p>
        </div>
        <Leaf className="tips-decoration" size={55} />
      </section>
    </div>
  );
}

export default Dashboard;
