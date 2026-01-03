import React, { useState } from 'react'; 
import { 
  FiArrowRight, 
  FiCheckCircle, 
  FiBarChart2, 
  FiClock, 
  FiHeadphones, 
  FiStar, 
  FiChevronDown,
  FiUser,
  FiGrid,
  FiBook,
  FiCpu,
  FiLayers,
  FiBriefcase,
  FiHeart,
  FiHome,
  FiBookOpen,
  FiUsers,
  FiHelpCircle,
  FiRadio,
  FiPlayCircle,
  FiCode,
  FiVideo,
  FiLifeBuoy,
  FiMessageSquare,
  FiActivity,
  FiDollarSign,
  FiShield,
  FiFileText,
  FiDatabase,
  FiLogIn,
  FiMapPin,
  FiPhone,
  FiMail,
  FiSun,
  FiTrendingUp,
  FiEye
} from 'react-icons/fi';
import './Homepage.css';

const Homepage = ({ onLoginClick }) => {
  const [productsDropdown, setProductsDropdown] = useState(false);
  const [solutionsDropdown, setSolutionsDropdown] = useState(false);
  const [resourcesDropdown, setResourcesDropdown] = useState(false);
  const [pricingDropdown, setPricingDropdown] = useState(false);

  const handleLoginRedirect = () => {
    if (onLoginClick) {
      onLoginClick();
    } else {
      // Fallback if prop is not provided
      window.location.href = '/login';
    }
  };

  const handleGetStarted = () => {
    if (onLoginClick) {
      onLoginClick();
    } else {
      // Fallback if prop is not provided
      window.location.href = '/login';
    }
  };

  const handleScheduleDemo = () => {
    console.log('Schedule demo clicked');
  };

  const toggleProductsDropdown = () => {
    setProductsDropdown(!productsDropdown);
    setSolutionsDropdown(false);
    setResourcesDropdown(false);
    setPricingDropdown(false);
  };

  const toggleSolutionsDropdown = () => {
    setSolutionsDropdown(!solutionsDropdown);
    setProductsDropdown(false);
    setResourcesDropdown(false);
    setPricingDropdown(false);
  };

  const toggleResourcesDropdown = () => {
    setResourcesDropdown(!resourcesDropdown);
    setProductsDropdown(false);
    setSolutionsDropdown(false);
    setPricingDropdown(false);
  };

  const togglePricingDropdown = () => {
    setPricingDropdown(!pricingDropdown);
    setProductsDropdown(false);
    setSolutionsDropdown(false);
    setResourcesDropdown(false);
  };

  const closeDropdowns = () => {
    setProductsDropdown(false);
    setSolutionsDropdown(false);
    setResourcesDropdown(false);
    setPricingDropdown(false);
  };

  const stats = [
    { icon: <FiBarChart2 />, value: '85%', label: 'Reduction in response time', description: 'Promotion to service burden - Improve frequent times for major brands' },
    { icon: <FiClock />, value: '24/7', label: 'Customer Support', description: 'Based on the development of customers, you can continue' },
    { icon: <FiHeadphones />, value: '10%', label: 'Cost Reductions', description: 'All three kinds are used as services to store or installs' },
    { icon: <FiStar />, value: '95%', label: 'Satisfaction rate', description: 'Customer support verification with a smaller target' }
  ];

  return (
    <div className="homepage" onClick={closeDropdowns}>
      {/* Navigation */}
      <nav className="homepage-nav">
        <div className="nav-container">
          <div className="nav-logo">
            <img 
              src="/cubeai-logo.png" 
              alt="CubeAI" 
              className="logo-image"
            />
          </div>
          
          <div className="nav-links">
            {/* Products Dropdown - Enhanced with colorful icons */}
            <div 
              className="nav-dropdown"
              onClick={(e) => e.stopPropagation()}
            >
              <button className="nav-link-btn" onClick={toggleProductsDropdown}>
                Products <FiChevronDown className={productsDropdown ? 'rotate' : ''} />
              </button>
              {productsDropdown && (
                <div className="dropdown-menu">
                  <div className="dropdown-header">
                    <h3>
                      <FiGrid className="header-icon" />
                      CubeAI Solutions
                    </h3>
                    <p>Discover our powerful AI products designed to transform your business</p>
                  </div>
                  
                  {/* Products Grid - Side by Side */}
                  <div className="products-grid">
                    {/* CubeAISolutions Brain - Left Side */}
                    <div className="product-column">
                      <div className="product-item">
                        <div className="product-icon-container brain-icon">
                          <FiCpu className="product-main-icon" />
                        </div>
                        <div className="product-info">
                          <div className="product-header">
                            <div className="product-name">
                              <FiCpu className="product-name-icon" />
                              CubeAISolutions Brain
                            </div>
                            <div className="product-badge">AI-Powered</div>
                          </div>
                          <div className="product-description">
                            Intelligent knowledge management system that works seamlessly across your organization with advanced AI capabilities
                          </div>
                          <div className="product-features-list">
                            <div className="feature-item">
                              <div className="feature-icon brain-feature">
                                <FiCheckCircle className="feature-check" />
                              </div>
                              <span>Smart Knowledge Management & Organization</span>
                            </div>
                            <div className="feature-item">
                              <div className="feature-icon brain-feature">
                                <FiCheckCircle className="feature-check" />
                              </div>
                              <span>AI-Powered Insights & Analytics Reports</span>
                            </div>
                            <div className="feature-item">
                              <div className="feature-icon brain-feature">
                                <FiCheckCircle className="feature-check" />
                              </div>
                              <span>Enterprise-Wide Semantic Search & Discovery</span>
                            </div>
                            <div className="feature-item">
                              <div className="feature-icon brain-feature">
                                <FiCheckCircle className="feature-check" />
                              </div>
                              <span>Automated Content Categorization</span>
                            </div>
                            <div className="feature-item">
                              <div className="feature-icon brain-feature">
                                <FiCheckCircle className="feature-check" />
                              </div>
                              <span>Real-time Knowledge Updates</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* CubeAISolutions Companion - Right Side */}
                    <div className="product-column">
                      <div className="product-item">
                        <div className="product-icon-container companion-icon">
                          <FiUser className="product-main-icon" />
                        </div>
                        <div className="product-info">
                          <div className="product-header">
                            <div className="product-name">
                              <FiUser className="product-name-icon" />
                              CubeAISolutions Companion
                            </div>
                            <div className="product-badge">Personal Assistant</div>
                          </div>
                          <div className="product-description">
                            Your personal AI assistant that understands your role and enhances productivity across all your workflows
                          </div>
                          
                          {/* Companion Features - Side by Side */}
                          <div className="companion-features-grid">
                            <div className="companion-feature-column">
                              <div className="companion-section-header">
                                <FiLayers className="section-icon" />
                                <h4>Core Features</h4>
                              </div>
                              <ul>
                                <li>
                                  <div className="feature-dot core-dot"></div>
                                  Meeting Assistant & Transcripts
                                </li>
                                <li>
                                  <div className="feature-dot core-dot"></div>
                                  AI-Powered Note-Taking
                                </li>
                                <li>
                                  <div className="feature-dot core-dot"></div>
                                  Email Composition & Assistance
                                </li>
                                <li>
                                  <div className="feature-dot core-dot"></div>
                                  Deep Research & Analysis
                                </li>
                                <li>
                                  <div className="feature-dot core-dot"></div>
                                  Multilingual Support
                                </li>
                                <li>
                                  <div className="feature-dot core-dot"></div>
                                  Smart Calendar Management
                                </li>
                                <li>
                                  <div className="feature-dot core-dot"></div>
                                  Document Summarization
                                </li>
                              </ul>
                            </div>
                            <div className="companion-feature-column">
                              <div className="companion-section-header">
                                <FiLayers className="section-icon" />
                                <h4>Advanced Tools</h4>
                              </div>
                              <ul>
                                <li>
                                  <div className="feature-dot advanced-dot"></div>
                                  Custom Agent Workspace
                                </li>
                                <li>
                                  <div className="feature-dot advanced-dot"></div>
                                  Workflow Automation
                                </li>
                                <li>
                                  <div className="feature-dot advanced-dot"></div>
                                  Content Creation Tools
                                </li>
                                <li>
                                  <div className="feature-dot advanced-dot"></div>
                                  Smart Suggestions
                                </li>
                                <li>
                                  <div className="feature-dot advanced-dot"></div>
                                  Chat Agent Integration
                                </li>
                                <li>
                                  <div className="feature-dot advanced-dot"></div>
                                  API Integration Hub
                                </li>
                                <li>
                                  <div className="feature-dot advanced-dot"></div>
                                  Custom AI Training
                                </li>
                              </ul>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="dropdown-divider"></div>

                  <button className="dropdown-item view-all">
                    <span>Explore All Products & Features</span>
                    <FiArrowRight className="arrow-icon" />
                  </button>
                </div>
              )}
            </div>

            {/* Solutions Dropdown - Enhanced with colorful icons */}
            <div 
              className="nav-dropdown"
              onClick={(e) => e.stopPropagation()}
            >
              <button className="nav-link-btn" onClick={toggleSolutionsDropdown}>
                Solutions <FiChevronDown className={solutionsDropdown ? 'rotate' : ''} />
              </button>
              {solutionsDropdown && (
                <div className="dropdown-menu">
                  <div className="dropdown-header">
                    <h3>
                      <FiBriefcase className="header-icon" />
                      Solutions by Role & Industry
                    </h3>
                    <p>Tailored AI solutions for your specific business needs and industry requirements</p>
                  </div>
                  
                  {/* Solutions Grid - By Role and By Industry */}
                  <div className="products-grid">
                    {/* By Role - Left Side */}
                    <div className="product-column">
                      <div className="product-item">
                        <div className="product-icon-container role-icon">
                          <FiUser className="product-main-icon" />
                        </div>
                        <div className="product-info">
                          <div className="product-header">
                            <div className="product-name">
                              <FiUser className="product-name-icon" />
                              By Role
                            </div>
                            <div className="product-badge">Role-Based</div>
                          </div>
                          <div className="product-description">
                            Specialized solutions designed for different roles and departments within your organization
                          </div>
                          <div className="product-features-list">
                            <div className="feature-item">
                              <div className="feature-icon role-feature">
                                <FiCheckCircle className="feature-check" />
                              </div>
                              <span>Sales</span>
                            </div>
                            <div className="feature-item">
                              <div className="feature-icon role-feature">
                                <FiCheckCircle className="feature-check" />
                              </div>
                              <span>Customer Support</span>
                            </div>
                            <div className="feature-item">
                              <div className="feature-icon role-feature">
                                <FiCheckCircle className="feature-check" />
                              </div>
                              <span>RevOps</span>
                            </div>
                            <div className="feature-item">
                              <div className="feature-icon role-feature">
                                <FiCheckCircle className="feature-check" />
                              </div>
                              <span>Marketing</span>
                            </div>
                            <div className="feature-item">
                              <div className="feature-icon role-feature">
                                <FiCheckCircle className="feature-check" />
                              </div>
                              <span>Operations</span>
                            </div>
                            <div className="feature-item">
                              <div className="feature-icon role-feature">
                                <FiCheckCircle className="feature-check" />
                              </div>
                              <span>Finance</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* By Industry - Right Side */}
                    <div className="product-column">
                      <div className="product-item">
                        <div className="product-icon-container industry-icon">
                          <FiHome className="product-main-icon" />
                        </div>
                        <div className="product-info">
                          <div className="product-header">
                            <div className="product-name">
                              <FiHome className="product-name-icon" />
                              By Industry
                            </div>
                            <div className="product-badge">Industry-Specific</div>
                          </div>
                          <div className="product-description">
                            Industry-specific AI solutions that address unique challenges and compliance requirements
                          </div>
                          
                          {/* Industry Features - Side by Side */}
                          <div className="companion-features-grid">
                            <div className="companion-feature-column">
                              <div className="companion-section-header">
                                <FiHeart className="section-icon" />
                                <h4>Core Industries</h4>
                              </div>
                              <ul>
                                <li>
                                  <div className="feature-dot core-industry-dot"></div>
                                  Healthcare
                                </li>
                                <li>
                                  <div className="feature-dot core-industry-dot"></div>
                                  Contact Center
                                </li>
                                <li>
                                  <div className="feature-dot core-industry-dot"></div>
                                  Banking
                                </li>
                                <li>
                                  <div className="feature-dot core-industry-dot"></div>
                                  Diagnostic
                                </li>
                                <li>
                                  <div className="feature-dot core-industry-dot"></div>
                                  Call Center
                                </li>
                              </ul>
                            </div>
                            <div className="companion-feature-column">
                              <div className="companion-section-header">
                                <FiHeart className="section-icon" />
                                <h4>Specialized Sectors</h4>
                              </div>
                              <ul>
                                <li>
                                  <div className="feature-dot specialized-dot"></div>
                                  Water Treatment
                                </li>
                                <li>
                                  <div className="feature-dot specialized-dot"></div>
                                  Building
                                </li>
                                <li>
                                  <div className="feature-dot specialized-dot"></div>
                                  Enterprise Contact Centre
                                </li>
                              </ul>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="dropdown-divider"></div>

                  <button className="dropdown-item view-all">
                    <span>Explore All Solutions</span>
                    <FiArrowRight className="arrow-icon" />
                  </button>
                </div>
              )}
            </div>

            {/* Resources Dropdown - Enhanced with colorful icons */}
            <div 
              className="nav-dropdown"
              onClick={(e) => e.stopPropagation()}
            >
              <button className="nav-link-btn" onClick={toggleResourcesDropdown}>
                Resources <FiChevronDown className={resourcesDropdown ? 'rotate' : ''} />
              </button>
              {resourcesDropdown && (
                <div className="resources-dropdown-menu">
                  <div className="dropdown-header">
                    <h3>
                      <FiBook className="header-icon" />
                      Resources & Documentation
                    </h3>
                    <p>Everything you need to succeed with CubeAI Solutions</p>
                  </div>
                  
                  <div className="resources-content">
                    {/* Three Column Layout for Resources */}
                    <div className="resources-grid-three">
                      {/* Documentation - Left Column */}
                      <div className="resources-column">
                        <div className="resources-section">
                          <div className="section-header">
                            <div className="section-icon doc-icon">
                              <FiBook className="icon" />
                            </div>
                            <div>
                              <h4>Documentation</h4>
                              <p>Comprehensive guides and API references</p>
                            </div>
                          </div>
                          <div className="resources-list">
                            <a href="#getting-started" className="resource-item">
                              <div className="resource-icon-wrapper getting-started">
                                <FiPlayCircle className="resource-icon" />
                              </div>
                              <div className="resource-content">
                                <div className="resource-title">Getting Started</div>
                                <div className="resource-desc">Quick start guides and tutorials</div>
                              </div>
                              <FiArrowRight className="resource-arrow" />
                            </a>
                            <a href="#api-reference" className="resource-item">
                              <div className="resource-icon-wrapper api-reference">
                                <FiCode className="resource-icon" />
                              </div>
                              <div className="resource-content">
                                <div className="resource-title">API Reference</div>
                                <div className="resource-desc">Developer documentation</div>
                              </div>
                              <FiArrowRight className="resource-arrow" />
                            </a>
                            <a href="#community-guides" className="resource-item">
                              <div className="resource-icon-wrapper community-guides">
                                <FiUsers className="resource-icon" />
                              </div>
                              <div className="resource-content">
                                <div className="resource-title">Community Guides</div>
                                <div className="resource-desc">Best practices & tips</div>
                              </div>
                              <FiArrowRight className="resource-arrow" />
                            </a>
                          </div>
                        </div>
                      </div>

                      {/* Learning Center - Middle Column */}
                      <div className="resources-column">
                        <div className="resources-section">
                          <div className="section-header">
                            <div className="section-icon learning-icon">
                              <FiBookOpen className="icon" />
                            </div>
                            <div>
                              <h4>Learning Center</h4>
                              <p>Tutorials and resources to master our platform</p>
                            </div>
                          </div>
                          <div className="resources-list">
                            <a href="#video-tutorials" className="resource-item">
                              <div className="resource-icon-wrapper video-tutorials">
                                <FiVideo className="resource-icon" />
                              </div>
                              <div className="resource-content">
                                <div className="resource-title">Video Tutorials</div>
                                <div className="resource-desc">Step-by-step video guides</div>
                              </div>
                              <FiArrowRight className="resource-arrow" />
                            </a>
                            <a href="#case-studies" className="resource-item">
                              <div className="resource-icon-wrapper case-studies">
                                <FiBarChart2 className="resource-icon" />
                              </div>
                              <div className="resource-content">
                                <div className="resource-title">Case Studies</div>
                                <div className="resource-desc">Real success stories</div>
                              </div>
                              <FiArrowRight className="resource-arrow" />
                            </a>
                            <a href="#webinars" className="resource-item">
                              <div className="resource-icon-wrapper webinars">
                                <FiRadio className="resource-icon" />
                              </div>
                              <div className="resource-content">
                                <div className="resource-title">Webinars</div>
                                <div className="resource-desc">Live sessions & recordings</div>
                              </div>
                              <FiArrowRight className="resource-arrow" />
                            </a>
                          </div>
                        </div>
                      </div>

                      {/* Support - Right Column */}
                      <div className="resources-column">
                        <div className="resources-section">
                          <div className="section-header">
                            <div className="section-icon support-icon">
                              <FiHelpCircle className="icon" />
                            </div>
                            <div>
                              <h4>Support</h4>
                              <p>Get help when you need it</p>
                            </div>
                          </div>
                          <div className="resources-list">
                            <a href="#help-center" className="resource-item">
                              <div className="resource-icon-wrapper help-center">
                                <FiLifeBuoy className="resource-icon" />
                              </div>
                              <div className="resource-content">
                                <div className="resource-title">Help Center</div>
                                <div className="resource-desc">FAQs & articles</div>
                              </div>
                              <FiArrowRight className="resource-arrow" />
                            </a>
                            <a href="#community-forum" className="resource-item">
                              <div className="resource-icon-wrapper community-forum">
                                <FiMessageSquare className="resource-icon" />
                              </div>
                              <div className="resource-content">
                                <div className="resource-title">Community Forum</div>
                                <div className="resource-desc">Connect with users</div>
                              </div>
                              <FiArrowRight className="resource-arrow" />
                            </a>
                            <a href="#status-page" className="resource-item">
                              <div className="resource-icon-wrapper status-page">
                                <FiActivity className="resource-icon" />
                              </div>
                              <div className="resource-content">
                                <div className="resource-title">Status Page</div>
                                <div className="resource-desc">System status & updates</div>
                              </div>
                              <FiArrowRight className="resource-arrow" />
                            </a>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="dropdown-divider"></div>

                  <button className="dropdown-item view-all">
                    <span>View All Resources</span>
                    <FiArrowRight className="arrow-icon" />
                  </button>
                </div>
              )}
            </div>

            {/* Pricing Dropdown - FIXED VERSION */}
            <div 
              className="nav-dropdown"
              onClick={(e) => e.stopPropagation()}
            >
              <button className="nav-link-btn" onClick={togglePricingDropdown}>
                Pricing <FiChevronDown className={pricingDropdown ? 'rotate' : ''} />
              </button>
              {pricingDropdown && (
                <div className="dropdown-menu pricing-dropdown-fix">
                  <div className="dropdown-header">
                    <h3>
                      <FiDollarSign className="header-icon" />
                      Simple, Transparent Pricing
                    </h3>
                    <p>Choose the perfect plan that fits your business needs</p>
                  </div>
                  
                  {/* Pricing Plans Grid */}
                  <div className="pricing-grid">
                    {/* Starter Plan */}
                    <div className="product-column">
                      <div className="product-item">
                        <div className="product-icon-container starter-icon">
                          <FiUsers className="product-main-icon" />
                        </div>
                        <div className="product-info">
                          <div className="product-header">
                            <div className="product-name">
                              <FiUsers className="product-name-icon" />
                              Starter
                            </div>
                            <div className="product-price">$49 /month</div>
                          </div>
                          <div className="product-description">
                            Perfect for small teams getting started
                          </div>
                          
                          <button className="dropdown-item view-all" style={{marginBottom: '1.5rem'}}>
                            <span>Get Started</span>
                            <FiArrowRight className="arrow-icon" />
                          </button>
                          
                          <div className="product-features-list">
                            <div className="feature-item">
                              <div className="feature-icon starter-feature">
                                <FiCheckCircle className="feature-check" />
                              </div>
                              <span>Up to 10 users</span>
                            </div>
                            <div className="feature-item">
                              <div className="feature-icon starter-feature">
                                <FiCheckCircle className="feature-check" />
                              </div>
                              <span>Basic analytics</span>
                            </div>
                            <div className="feature-item">
                              <div className="feature-icon starter-feature">
                                <FiCheckCircle className="feature-check" />
                              </div>
                              <span>Email support</span>
                            </div>
                            <div className="feature-item">
                              <div className="feature-icon starter-feature">
                                <FiCheckCircle className="feature-check" />
                              </div>
                              <span>1GB storage</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Professional Plan */}
                    <div className="product-column">
                      <div className="product-item">
                        <div className="product-icon-container professional-icon">
                          <FiBarChart2 className="product-main-icon" />
                        </div>
                        <div className="product-info">
                          <div className="product-header">
                            <div className="product-name">
                              <FiBarChart2 className="product-name-icon" />
                              Professional
                            </div>
                            <div className="pricing-badge">Most Popular</div>
                          </div>
                          <div className="product-price">$199 /month</div>
                          <div className="product-description">
                            For growing teams with more advanced needs
                          </div>
                          
                          <button className="dropdown-item view-all" style={{marginBottom: '1.5rem', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)'}}>
                            <span>Start Free Trial</span>
                            <FiArrowRight className="arrow-icon" />
                          </button>
                          
                          <div className="product-features-list">
                            <div className="feature-item">
                              <div className="feature-icon professional-feature">
                                <FiCheckCircle className="feature-check" />
                              </div>
                              <span>Up to 50 users</span>
                            </div>
                            <div className="feature-item">
                              <div className="feature-icon professional-feature">
                                <FiCheckCircle className="feature-check" />
                              </div>
                              <span>Advanced analytics</span>
                            </div>
                            <div className="feature-item">
                              <div className="feature-icon professional-feature">
                                <FiCheckCircle className="feature-check" />
                              </div>
                              <span>Priority support</span>
                            </div>
                            <div className="feature-item">
                              <div className="feature-icon professional-feature">
                                <FiCheckCircle className="feature-check" />
                              </div>
                              <span>10GB storage</span>
                            </div>
                            <div className="feature-item">
                              <div className="feature-icon professional-feature">
                                <FiCheckCircle className="feature-check" />
                              </div>
                              <span>API access</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Enterprise Plan */}
                    <div className="product-column">
                      <div className="product-item">
                        <div className="product-icon-container enterprise-icon">
                          <FiShield className="product-main-icon" />
                        </div>
                        <div className="product-info">
                          <div className="product-header">
                            <div className="product-name">
                              <FiShield className="product-name-icon" />
                              Enterprise
                            </div>
                            <div className="product-price">Custom</div>
                          </div>
                          <div className="product-description">
                            For large organizations with complex needs
                          </div>
                          
                          <button className="dropdown-item view-all" style={{marginBottom: '1.5rem', background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)'}}>
                            <span>Contact Sales</span>
                            <FiArrowRight className="arrow-icon" />
                          </button>
                          
                          <div className="product-features-list">
                            <div className="feature-item">
                              <div className="feature-icon enterprise-feature">
                                <FiCheckCircle className="feature-check" />
                              </div>
                              <span>Unlimited users</span>
                            </div>
                            <div className="feature-item">
                              <div className="feature-icon enterprise-feature">
                                <FiCheckCircle className="feature-check" />
                              </div>
                              <span>Dedicated support</span>
                            </div>
                            <div className="feature-item">
                              <div className="feature-icon enterprise-feature">
                                <FiCheckCircle className="feature-check" />
                              </div>
                              <span>Custom integrations</span>
                            </div>
                            <div className="feature-item">
                              <div className="feature-icon enterprise-feature">
                                <FiCheckCircle className="feature-check" />
                              </div>
                              <span>Unlimited storage</span>
                            </div>
                            <div className="feature-item">
                              <div className="feature-icon enterprise-feature">
                                <FiCheckCircle className="feature-check" />
                              </div>
                              <span>SLA</span>
                            </div>
                            <div className="feature-item">
                              <div className="feature-icon enterprise-feature">
                                <FiCheckCircle className="feature-check" />
                              </div>
                              <span>Custom reporting</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Additional Features */}
                  <div className="dropdown-divider"></div>
                  
                  <div className="products-grid" style={{marginTop: '1rem'}}>
                    <div className="product-column">
                      <div className="feature-item" style={{border: 'none', padding: '1rem'}}>
                        <div className="feature-icon team-feature">
                          <FiUsers className="feature-check" />
                        </div>
                        <div>
                          <div style={{fontWeight: '600', color: '#1e293b'}}>Team Management</div>
                          <div style={{color: '#64748b', fontSize: '0.9rem'}}>Invite team members and set permissions</div>
                        </div>
                      </div>
                    </div>
                    <div className="product-column">
                      <div className="feature-item" style={{border: 'none', padding: '1rem'}}>
                        <div className="feature-icon analytics-feature">
                          <FiBarChart2 className="feature-check" />
                        </div>
                        <div>
                          <div style={{fontWeight: '600', color: '#1e293b'}}>Advanced Analytics</div>
                          <div style={{color: '#64748b', fontSize: '0.9rem'}}>Get insights into your usage and growth</div>
                        </div>
                      </div>
                    </div>
                    <div className="product-column">
                      <div className="feature-item" style={{border: 'none', padding: '1rem'}}>
                        <div className="feature-icon security-feature">
                          <FiShield className="feature-check" />
                        </div>
                        <div>
                          <div style={{fontWeight: '600', color: '#1e293b'}}>Security First</div>
                          <div style={{color: '#64748b', fontSize: '0.9rem'}}>Enterprise-grade security and compliance</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="dropdown-divider"></div>

                  <button className="dropdown-item view-all">
                    <span>Compare All Plans</span>
                    <FiArrowRight className="arrow-icon" />
                  </button>
                </div>
              )}
            </div>
          </div>
          
          <div className="nav-actions">
            <button className="nav-btn secondary" onClick={handleLoginRedirect}>
              <FiLogIn /> Log In
            </button>
            <button className="nav-btn primary" onClick={handleGetStarted}>
              Get Started
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section - Fixed */}
      <section className="hero-section">
        <div className="hero-container">
          <div className="hero-content">
            <h1 className="hero-title">
              AI-Powered Contact Center Transformation
            </h1>
            <p className="hero-subtitle">
              AI Agents that Automate Tier 1, Assist Tier 2, and Empower Every Interaction 
              with Accuracy, Speed, and Confidence.
            </p>
            
            <div className="hero-actions">
              <button className="hero-btn primary" onClick={handleGetStarted}>
                Get Started for Free
                <FiArrowRight />
              </button>
              <button className="hero-btn secondary" onClick={handleScheduleDemo}>
                Schedule a Demo
              </button>
            </div>
          </div>
          
          <div className="hero-graphic">
            <div className="graphic-placeholder">
              <div className="ai-agent">AI Agent</div>
              <div className="interaction-flow">
                <div className="flow-item">Tier 1 Automation</div>
                <div className="flow-item">Tier 2 Assistance</div>
                <div className="flow-item">Quality Analytics</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="stats-section">
        <div className="container">
          <h2 className="section-title">Enterprise-Grade AI Solutions</h2>
          <p className="section-subtitle">
            Our platform delivers measurable results that drive business growth and customer satisfaction.
          </p>
          
          <div className="stats-grid">
            {stats.map((stat, index) => (
              <div key={index} className="stat-card">
                <div className="stat-icon">{stat.icon}</div>
                <div className="stat-value">{stat.value}</div>
                <div className="stat-label">{stat.label}</div>
                <div className="stat-description">{stat.description}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Solutions Section - UPDATED FOR PERFECT ALIGNMENT */}
      <section className="solutions-section" id="solutions">
        <div className="container">
          <h2 className="section-title">Our Solution</h2>
          
          <div className="solutions-grid">
            <div className="solution-card">
              <div className="solution-header">
                <div className="solution-icon-container tier1-icon">
                  <FiCpu className="solution-main-icon" />
                </div>
                <h3 className="solution-title">Tier 1 – AI Automation</h3>
              </div>
              <p className="solution-description">Handle 70% of inquiries with AI-powered solutions.</p>
              <ul className="solution-features">
                <li>
                  <div className="solution-feature-icon tier1-feature">
                    <FiMessageSquare className="feature-check" />
                  </div>
                  <span>Natural Language Processing</span>
                </li>
                <li>
                  <div className="solution-feature-icon tier1-feature">
                    <FiArrowRight className="feature-check" />
                  </div>
                  <span>Automated Response</span>
                </li>
                <li>
                  <div className="solution-feature-icon tier1-feature">
                    <FiClock className="feature-check" />
                  </div>
                  <span>24/7 Availability</span>
                </li>
              </ul>
            </div>

            <div className="solution-card">
              <div className="solution-header">
                <div className="solution-icon-container tier2-icon">
                  <FiUsers className="solution-main-icon" />
                </div>
                <h3 className="solution-title">Tier 2 – Human + AI</h3>
              </div>
              <p className="solution-description">AI-assisted human agents for complex inquiries.</p>
              <ul className="solution-features">
                <li>
                  <div className="solution-feature-icon tier2-feature">
                    <FiSun className="feature-check" />
                  </div>
                  <span>Real-time AI Suggestions</span>
                </li>
                <li>
                  <div className="solution-feature-icon tier2-feature">
                    <FiDatabase className="feature-check" />
                  </div>
                  <span>Knowledge Base Integration</span>
                </li>
                <li>
                  <div className="solution-feature-icon tier2-feature">
                    <FiHeart className="feature-check" />
                  </div>
                  <span>Sentiment Analysis</span>
                </li>
              </ul>
            </div>

            <div className="solution-card">
              <div className="solution-header">
                <div className="solution-icon-container tier3-icon">
                  <FiBarChart2 className="solution-main-icon" />
                </div>
                <h3 className="solution-title">Quality & Analytics</h3>
              </div>
              <p className="solution-description">Continuous improvement through data insights.</p>
              <ul className="solution-features">
                <li>
                  <div className="solution-feature-icon tier3-feature">
                    <FiTrendingUp className="feature-check" />
                  </div>
                  <span>Performance Analytics</span>
                </li>
                <li>
                  <div className="solution-feature-icon tier3-feature">
                    <FiEye className="feature-check" />
                  </div>
                  <span>Quality Monitoring</span>
                </li>
                <li>
                  <div className="solution-feature-icon tier3-feature">
                    <FiFileText className="feature-check" />
                  </div>
                  <span>Automated Reporting</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Data Flow Architecture Section */}
      <section className="dataflow-section">
        <div className="container">
          <h2 className="section-title">AI Data Flow Architecture</h2>
          <p className="section-subtitle">
            How our AI processes information from multiple sources to deliver intelligent responses
          </p>
          
          <div className="dataflow-diagram">
            {/* Data Sources Column */}
            <div className="dataflow-column data-sources">
              <div className="dataflow-header">
                <FiDatabase className="dataflow-icon" />
                <h3>Data Sources</h3>
              </div>
              <div className="dataflow-items">
                <div className="dataflow-item">
                  <div className="item-icon">
                    <FiLayers />
                  </div>
                  <span>CRM Systems</span>
                </div>
                <div className="dataflow-item">
                  <div className="item-icon">
                    <FiUsers />
                  </div>
                  <span>Customer Databases</span>
                </div>
                <div className="dataflow-item">
                  <div className="item-icon">
                    <FiBook />
                  </div>
                  <span>Knowledge Bases</span>
                </div>
                <div className="dataflow-item">
                  <div className="item-icon">
                    <FiCode />
                  </div>
                  <span>APIs</span>
                </div>
              </div>
            </div>
            
            {/* Arrow */}
            <div className="dataflow-arrow">
              <FiArrowRight />
            </div>
            
            {/* AI Processing Column */}
            <div className="dataflow-column ai-processing">
              <div className="dataflow-header">
                <FiCpu className="dataflow-icon" />
                <h3>AI Processing</h3>
              </div>
              <div className="dataflow-items">
                <div className="dataflow-item">
                  <div className="item-icon">
                    <FiMessageSquare />
                  </div>
                  <span>Natural Language Understanding</span>
                </div>
                <div className="dataflow-item">
                  <div className="item-icon">
                    <FiActivity />
                  </div>
                  <span>Machine Learning Models</span>
                </div>
                <div className="dataflow-item">
                  <div className="item-icon">
                    <FiHeart />
                  </div>
                  <span>Sentiment Analysis</span>
                </div>
                <div className="dataflow-item">
                  <div className="item-icon">
                    <FiArrowRight />
                  </div>
                  <span>Response Generation</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Architecture Section with Image */}
      <section className="architecture-section">
        <div className="container">
          <h2 className="section-title">Our AI-Powered Architecture</h2>
          <p className="section-subtitle">
            A comprehensive solution that transforms your contact center operations
          </p>
          
          <div className="architecture-diagram">
            <img 
              src="/architecture-diagram.png" 
              alt="CubeAI Solutions Architecture Diagram"
              className="architecture-image"
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="homepage-footer">
        <div className="container">
          <div className="footer-content">
            <div className="footer-section">
              <h4>CubeAI Solutions</h4>
              <p>Enhanced business with advanced AI solutions and innovative offerings for sustainable growth across industries worldwide.</p>
            </div>
            
            <div className="footer-section">
              <h4>Contact Us</h4>
              <div className="contact-details">
                <div className="contact-item">
                  <FiMapPin className="contact-icon" />
                  <div>
                    <p>#123, Tech Park,</p>
                    <p>Bangalore, Karnataka</p>
                    <p>India - 560001</p>
                  </div>
                </div>
                <div className="contact-item">
                  <FiPhone className="contact-icon" />
                  <p>+91 9486938781</p>
                </div>
                <div className="contact-item">
                  <FiMail className="contact-icon" />
                  <p>contact@cubeaisolutions.com</p>
                </div>
              </div>
            </div>
          </div>
          
          <div className="footer-bottom">
            <p>&copy; 2025 CubeAI Solutions. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Homepage;