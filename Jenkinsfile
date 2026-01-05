pipeline {
    agent any

    environment {
        COMPOSE_PROJECT_NAME = "email-app"
        VM_USER    = "ubuntu"
        VM_HOST    = "65.1.129.37"
        VM_APP_DIR = "/home/ubuntu/email-main"
    }

    options {
        timestamps()
        timeout(time: 30, unit: 'MINUTES')
    }

    stages {

        // -----------------------------
        // 1. Checkout Code
        // -----------------------------
        stage('Checkout Code') {
            steps {
                echo "📥 Checking out source code"
                checkout scm
            }
        }

        // -----------------------------
        // 2. Test SSH Connection
        // -----------------------------
        stage('Test SSH Connection') {
            steps {
                sshagent(['aws-email-vm-ssh']) {
                    sh """
                    ssh -o StrictHostKeyChecking=no ${VM_USER}@${VM_HOST} << 'EOF'
                        echo "✅ SSH connected"
                        hostname
                        whoami
                        docker --version
                        docker compose version
EOF
                    """
                }
            }
        }

        // -----------------------------
        // 3. Remove Old Code on VM
        // -----------------------------
        stage('Remove Old Code on VM') {
            steps {
                sshagent(['aws-email-vm-ssh']) {
                    sh """
                    ssh -o StrictHostKeyChecking=no ${VM_USER}@${VM_HOST} << 'EOF'
                        echo "🧹 Removing old application code"
                        rm -rf ${VM_APP_DIR}
                        mkdir -p ${VM_APP_DIR}
EOF
                    """
                }
            }
        }

        // -----------------------------
        // 4. Copy Fresh Code to VM
        // -----------------------------
        stage('Copy Fresh Code to VM') {
            steps {
                sshagent(['aws-email-vm-ssh']) {
                    sh """
                    rsync -avz \
                        --exclude='.git' \
                        --exclude='node_modules' \
                        --exclude='__pycache__' \
                        ./ ${VM_USER}@${VM_HOST}:${VM_APP_DIR}/
                    """
                }
            }
        }

        // -----------------------------
        // 5. Stop Old Containers (keep volumes)
        // -----------------------------
        stage('Cleanup Containers') {
            steps {
                sshagent(['aws-email-vm-ssh']) {
                    sh """
                    ssh -o StrictHostKeyChecking=no ${VM_USER}@${VM_HOST} << 'EOF'
                        cd ${VM_APP_DIR}
                        echo "🧹 Stopping containers (preserving volumes & TLS certs)"
                        docker compose down --remove-orphans || true
EOF
                    """
                }
            }
        }

        // -----------------------------
        // 6. Build & Deploy
        // -----------------------------
        stage('Build & Deploy') {
            steps {
                sshagent(['aws-email-vm-ssh']) {
                    sh """
                    ssh -o StrictHostKeyChecking=no ${VM_USER}@${VM_HOST} << 'EOF'
                        set -e
                        cd ${VM_APP_DIR}

                        echo "🐳 Building backend image"
                        docker compose build email-backend

                        echo "🚀 Starting containers"
                        docker compose up -d

                        echo "🔄 Reloading Caddy"
                        docker exec caddy caddy reload --config /etc/caddy/Caddyfile
EOF
                    """
                }
            }
        }

        // -----------------------------
        // 7. Verify Services
        // -----------------------------
        stage('Verify Services') {
            steps {
                sshagent(['aws-email-vm-ssh']) {
                    retry(5) {
                        sh """
                        ssh -o StrictHostKeyChecking=no ${VM_USER}@${VM_HOST} << 'EOF'
                            echo "🔍 Frontend check"
                            curl --fail https://emailagent.cubegtp.com/

                            echo "🔍 Backend check"
                            curl --fail https://emailagent.cubegtp.com/auth/check-auth
EOF
                        """
                        sleep 5
                    }
                }
            }
        }
    }

    post {
        success {
            echo "✅ Deployment successful"
        }
        failure {
            echo "❌ Deployment failed — check Jenkins logs"
        }
    }
}
