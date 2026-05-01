import { useState, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "./../AuthContext";

function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [planId, setPlanId] = useState(1);
  const navigate = useNavigate();
  const { login } = useContext(AuthContext);

  const fetchRegister = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch("http://localhost:5000/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, email, password, plan_id: planId }),
      });

      const data = await response.json();

      if (response.ok) {
        // Auto-login by simulating the login process
        const loginResponse = await fetch("http://localhost:5000/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        
        const loginData = await loginResponse.json();
        if (loginResponse.ok) {
          login(loginData.user, loginData.token);
          if (planId > 1) {
            navigate("/payment");
          } else {
            navigate("/");
          }
        } else {
          alert("Registration successful, but auto-login failed. Please login.");
          navigate("/login");
        }
      } else {
        alert(data.message || "Registration failed");
      }
    } catch (err) {
      console.error("Registration error:", err);
      alert("An error occurred during registration.");
    }
  };

  return (
    <div className="auth-container">
      <h2>Register</h2>

      <form onSubmit={fetchRegister}>
        <input
          type="text"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <select 
          value={planId} 
          onChange={(e) => setPlanId(Number(e.target.value))} 
          required
          style={{ width: '100%', padding: '14px 16px', margin: '12px 0', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', fontSize: '15px' }}
        >
          <option value={1}>Free Plan (Basic Content)</option>
          <option value={2}>Premium Plan (All Content)</option>
        </select>

        <button type="submit">Register</button>
      </form>

      <p>
        Already have an account? <a href="/login">Login</a>
      </p>
    </div>
  );
}

export default Register;
