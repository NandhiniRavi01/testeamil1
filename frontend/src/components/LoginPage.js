// LoginPage.js - Updated with left side image
import React, { useState,  useEffect } from "react";
import { FiMail, FiLock, FiUser, FiLogIn, FiUserPlus, FiEye, FiEyeOff, FiSend, FiArrowLeft } from "react-icons/fi";
import "./LoginPage.css";

function LoginPage({ onLogin, onBackToHome }) {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: ""
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [showPassword, setShowPassword] = useState(false);
  
  const [forgotPassword, setForgotPassword] = useState(false);
  const [resetStep, setResetStep] = useState(1);
  const [resetEmail, setResetEmail] = useState("");


    useEffect(() => {
    // Check if user is already logged in when component mounts
    const checkExistingAuth = async () => {
      try {
        const response = await fetch('https://emailagent.cubegtp.com/auth/check-auth', {
          method: 'GET',
          credentials: 'include',
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.authenticated) {
            // User is already logged in, redirect to app
            onLogin(data.user);
          }
        }
      } catch (error) {
        console.error("Error checking existing auth:", error);
      }
    };
    
    checkExistingAuth();
  }, [onLogin]);

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: "", text: "" });

    try {
      const endpoint = isLogin ? "/auth/login" : "/auth/register";
      const response = await fetch(`https://emailagent.cubegtp.com/${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
        credentials: "include"
      });

      const data = await response.json();

      if (response.ok) {
        if (isLogin) {
          localStorage.setItem('user', JSON.stringify(data.user));
          onLogin(data.user);
          setMessage({ type: "success", text: "Login successful!" });
        } else {
          setMessage({ type: "success", text: "Registration successful! Please login." });
          setIsLogin(true);
        }
        setFormData({ username: "", email: "", password: "" });
      } else {
        setMessage({ type: "error", text: data.error || "An error occurred" });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Network error. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: "", text: "" });

    try {
      const response = await fetch("https://emailagent.cubegtp.com/auth/forgot-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: resetEmail }),
        credentials: "include"
      });

      const data = await response.json();

      if (response.ok) {
        setMessage({ type: "success", text: "Reset link sent!" });
        setResetStep(2);
      } else {
        setMessage({ type: "error", text: data.error || "Failed to send reset email" });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Network error. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLogin = () => {
    setForgotPassword(false);
    setResetStep(1);
    setResetEmail("");
    setFormData({ username: "", email: "", password: "" });
    setMessage({ type: "", text: "" });
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const isFormValid = () => {
    if (forgotPassword) {
      return resetStep === 1 ? resetEmail && resetEmail.includes('@') : formData.password && formData.password.length >= 6;
    } else {
      if (isLogin) {
        return formData.username && formData.password;
      } else {
        return formData.username && formData.email && formData.email.includes('@') && formData.password && formData.password.length >= 6;
      }
    }
  };

  return (
    <div className="login-container">
      <div className="login-wrapper">
        {/* Left Image Section */}
        <div className="login-image-section">
          <div className="login-image-content">
            <img 
              src="/login.png" 
              alt="Cube AI Login" 
              className="login-image"
              onError={(e) => {
                e.target.style.display = 'none';
              }}
            />
            <h2>Welcome to Cube AI</h2>
            <p>Your intelligent assistant for seamless productivity and smart solutions</p>
          </div>
        </div>

        {/* Right Form Section */}
        <div className="login-form-section">
          <div className="login-card">
            {!forgotPassword ? (
              <div className="login-header">
                <div className="login-icon">
                  <FiSend />
                </div>
                <h2>Cube AI</h2>
                <p>{isLogin ? "Sign in to your account" : "Create new account"}</p>
              </div>
            ) : (
              <div className="login-header">
                <div className="login-icon">
                  <FiLock />
                </div>
                <h2>Reset Password</h2>
                <p>{resetStep === 1 ? "Enter your email" : "Enter new password"}</p>
              </div>
            )}

            {message.text && (
              <div className={`message ${message.type}`}>
                {message.text}
              </div>
            )}

            {forgotPassword ? (
              <form className="login-form" onSubmit={handleForgotPassword}>
                {resetStep === 1 ? (
                  <div className="form-group">
                    <FiMail className="input-icon" />
                    <input
                      type="email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      required
                      placeholder="Email Address"
                      disabled={loading}
                    />
                  </div>
                ) : (
                  <div className="form-group">
                    <FiLock className="input-icon" />
                    <input
                      type={showPassword ? "text" : "password"}
                      name="password"
                      value={formData.password}
                      onChange={handleInputChange}
                      required
                      placeholder="New Password"
                      disabled={loading}
                      minLength="6"
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={togglePasswordVisibility}
                      disabled={loading}
                    >
                      {showPassword ? <FiEyeOff /> : <FiEye />}
                    </button>
                  </div>
                )}

                <button 
                  type="submit" 
                  className="login-btn" 
                  disabled={loading || !isFormValid()}
                >
                  {loading ? (
                    <>
                      <div className="loading-spinner"></div>
                      {resetStep === 1 ? "Sending..." : "Resetting..."}
                    </>
                  ) : (
                    <>
                      {resetStep === 1 ? <FiSend /> : <FiLock />}
                      {resetStep === 1 ? "Send Reset Link" : "Reset Password"}
                    </>
                  )}
                </button>

                <div className="toggle-mode">
                  <p>
                    Remember password?{" "}
                    <button 
                      type="button" 
                      className="toggle-btn" 
                      onClick={handleBackToLogin}
                      disabled={loading}
                    >
                      Back to Login
                    </button>
                  </p>
                </div>
              </form>
            ) : (
              <form className="login-form" onSubmit={handleSubmit}>
                {!isLogin && (
                  <div className="form-group">
                    <FiMail className="input-icon" />
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      required
                      placeholder="Email Address"
                      disabled={loading}
                    />
                  </div>
                )}

                <div className="form-group">
                  <FiUser className="input-icon" />
                  <input
                    type="text"
                    name="username"
                    value={formData.username}
                    onChange={handleInputChange}
                    required
                    placeholder="Username"
                    disabled={loading}
                  />
                </div>

                <div className="form-group">
                  <FiLock className="input-icon" />
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    required
                    placeholder="Password"
                    disabled={loading}
                    minLength={isLogin ? "1" : "6"}
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={togglePasswordVisibility}
                    disabled={loading}
                  >
                    {showPassword ? <FiEyeOff /> : <FiEye />}
                  </button>
                </div>

                {isLogin && (
                  <button 
                    type="button" 
                    className="forgot-password-link" 
                    onClick={() => setForgotPassword(true)}
                    disabled={loading}
                  >
                    Forgot your password?
                  </button>
                )}

                <button 
                  type="submit" 
                  className="login-btn" 
                  disabled={loading || !isFormValid()}
                >
                  {loading ? (
                    <>
                      <div className="loading-spinner"></div>
                      {isLogin ? "Signing in..." : "Creating account..."}
                    </>
                  ) : (
                    <>
                      {isLogin ? <FiLogIn /> : <FiUserPlus />}
                      {isLogin ? "SIGN IN" : "CREATE ACCOUNT"}
                    </>
                  )}
                </button>
              </form>
            )}

            {!forgotPassword && (
              <div className="toggle-mode">
                <p>
                  {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
                  <button
                    type="button"
                    className="toggle-btn"
                    onClick={() => {
                      setIsLogin(!isLogin);
                      setFormData({ username: "", email: "", password: "" });
                      setMessage({ type: "", text: "" });
                    }}
                    disabled={loading}
                  >
                    {isLogin ? "Sign up" : "Sign in"}
                  </button>
                </p>
              </div>
            )}

            <button 
              type="button" 
              className="back-to-login" 
              onClick={onBackToHome}
              disabled={loading}
            >
              <FiArrowLeft />
              Back to Homepage
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


export default LoginPage;




