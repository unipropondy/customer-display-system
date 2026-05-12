import React, { useEffect, useState, useCallback } from "react";
import "./cust-display-system.css";
import { BASE_URL } from "./config/api";

export default function CustDisplaySystem({ dbName }) {
    const CARDS_PER_PAGE = 12; // 3 rows of 4 or 2 rows of 6
    const [orders, setOrders] = useState([]);
    const [now, setNow] = useState(new Date());
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(0);

    const getTime = (time) => {
        let diff = now.getTime() - new Date(time).getTime();
        if (diff < 0) diff = 0;
        let totalSec = Math.floor(diff / 1000);
        const min = Math.floor(totalSec / 60);
        return min;
    };

    const getStatus = (min, statusLabel) => {
        if (statusLabel === 'READY') return { color: "#27ae60", label: "READY", class: "ready" };
        return { color: "#e74c3c", label: "PREPARING", class: "preparing" };
    };

    const fetchOrders = useCallback(async () => {
        try {
            const headers = { 'x-db-name': dbName };
            const res = await fetch(`${BASE_URL}/cds-today`, { headers });
            const data = await res.json();
            setOrders(data);
            setLoading(false);
        } catch (err) {
            console.error("Error fetching CDS orders:", err);
        }
    }, [dbName]);

    useEffect(() => {
        fetchOrders();
        const timer = setInterval(() => setNow(new Date()), 1000);
        const refresh = setInterval(fetchOrders, 5000);
        return () => {
            clearInterval(timer);
            clearInterval(refresh);
        };
    }, [fetchOrders]);

    // Auto-pagination logic
    useEffect(() => {
        if (orders.length <= CARDS_PER_PAGE) {
            setCurrentPage(0);
            return;
        }
        const interval = setInterval(() => {
            setCurrentPage((prev) => (prev + 1) % Math.ceil(orders.length / CARDS_PER_PAGE));
        }, 8000); // Rotate every 8 seconds
        return () => clearInterval(interval);
    }, [orders.length]);

    const displayedOrders = orders.slice(
        currentPage * CARDS_PER_PAGE,
        (currentPage + 1) * CARDS_PER_PAGE
    );

    const handleChangeDB = () => {
        localStorage.removeItem('selected_db');
        window.location.search = ''; // This will trigger the DbSelector
    };

    return (
        <div className="cds-container">
            <header className="cds-header">
                <div className="logo-section">
                    <h1>
                        ORDER STATUS 
                        <span className="db-badge-container">
                            <span className="db-badge">{dbName}</span>
                            <button className="db-change-btn" onClick={handleChangeDB}>Change</button>
                        </span>
                    </h1>
                </div>
                {orders.length > CARDS_PER_PAGE && (
                    <div className="pagination-info">
                        PAGE {currentPage + 1} / {Math.ceil(orders.length / CARDS_PER_PAGE)}
                    </div>
                )}
                <div className="current-time">
                    {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
            </header>

            <main className="cds-main">
                <div className="cds-card-grid">
                    {displayedOrders.map(order => {
                        const min = getTime(order.OrderDateTime);
                        const status = getStatus(min, order.StatusLabel);
                        return (
                            <div key={order.OrderId} className={`cds-card ${status.class} ${order.StatusLabel === 'READY' ? 'pulse' : ''}`} style={{ borderTop: `8px solid ${status.color}` }}>
                                <div className="card-table">
                                    <span className="label">TABLE</span>
                                    <span className="value">{order.Tableno}</span>
                                </div>
                                <div className="card-status">
                                    <span className="status-dot" style={{ backgroundColor: status.color }}></span>
                                    <span className="status-label">{status.label}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {orders.length === 0 && !loading && (
                    <div className="empty-state">
                        <h2>ALL ORDERS COMPLETED</h2>
                        <p>Thank you for your patience</p>
                    </div>
                )}
            </main>

            <footer className="cds-footer">
                <div className="footer-scroll">
                    <span>PLEASE COLLECT YOUR ORDER WHEN YOUR NUMBER IS READY</span>
                    <span className="separator">•</span>
                    <span>THANK YOU FOR DINING WITH US</span>
                    <span className="separator">•</span>
                    <span>ENJOY YOUR MEAL!</span>
                </div>
            </footer>
        </div>
    );
}
