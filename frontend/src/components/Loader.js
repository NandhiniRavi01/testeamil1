import React, { useState, useEffect } from 'react';
import './Loader.css';

const Loader = ({ show, message = "Loading...", onFinish }) => {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (show) {
            setVisible(true);
            const timer = setTimeout(() => {
                setVisible(false);
                if (onFinish) onFinish();
            }, 3000);
            return () => clearTimeout(timer);
        } else {
            setVisible(false);
        }
    }, [show, onFinish]);

    if (!visible) return null;

    return (
        <div className="cube-loader-overlay">
            <div className="cube-loader-content">
                <img src="/cubeai-logo.png" alt="Cube Logo" className="cube-loader-logo" />
                <div className="cube-loader-text">{message}</div>
            </div>
        </div>
    );
};

export default Loader;
