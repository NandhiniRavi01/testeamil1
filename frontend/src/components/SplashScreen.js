import React, { useState, useEffect } from 'react';
import './SplashScreen.css';

const SplashScreen = ({ message, onComplete }) => {
    const [isVisible, setIsVisible] = useState(true);

    useEffect(() => {
        const timer = setTimeout(() => {
            setIsVisible(false);
            if (onComplete) onComplete();
        }, 3000);

        return () => clearTimeout(timer);
    }, [onComplete]);

    if (!isVisible) return null;

    return (
        <div className="splash-overlay">
            <div className="splash-content">
                <div className="splash-logo-container">
                    <div className="cube-icon">
                        <div className="face front"></div>
                        <div className="face back"></div>
                        <div className="face right"></div>
                        <div className="face left"></div>
                        <div className="face top"></div>
                        <div className="face bottom"></div>
                    </div>
                    <div className="logo-text">
                        <div className="brand">CubeAI</div>
                        <div className="subtext">Solutions</div>
                    </div>
                </div>
                <div className="splash-message-container">
                    <h2 className="loading-text">{message || 'Initializing Engine...'}</h2>
                </div>
            </div>
        </div>
    );
};

export default SplashScreen;
