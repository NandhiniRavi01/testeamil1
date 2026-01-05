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
                    ssh -o StrictHostKeyChecking=no ${VM_USER}@${VM_HOST} '
                        echo "✅ SSH connected"
                        hostname
                        whoami
                        docker --version
                        docker compose version
                    '
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
                    ssh -o StrictHostKeyChecking=no ${VM_USER}@${VM_HOST} '
                        echo "🧹 Removing old application code"
                        rm -rf ${VM_APP_DIR}
                        mkdir -p ${VM_APP_DIR}
                    '
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
        // 5. Stop & Remove Old Containers + Images
        // -----------------------------
        stage('Cleanup Containers & Images') {
            steps {
                sshagent(['aws-email-vm-ssh']) {
                    sh """
                    ssh -o StrictHostKeyChecking=no ${VM_USER}@${VM_HOST} '
                        cd ${VM_APP_DIR}
                        echo "🧹 Stopping containers and removing old images"
                        docker compose down --rmi all --volumes --remove-orphans || true
                    '
                    """
                }
            }
        }

        // -----------------------------
        // 6. Build & Deploy with RDS CA
        // -----------------------------
       stage('Build & Deploy') {
    steps {
        sshagent(['aws-email-vm-ssh']) {
            sh """
            ssh -o StrictHostKeyChecking=no ${VM_USER}@${VM_HOST} << 'EOF'
                set -e
                cd ${VM_APP_DIR}

                echo "🐳 Building fresh backend image"
                docker compose build --no-cache email-backend

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
                        ssh -o StrictHostKeyChecking=no ${VM_USER}@${VM_HOST} '
                            echo "🔍 Backend check"
                            curl --fail https://emailagent.cubegtp.com/

                            echo "🔍 Frontend check"
                            curl --fail https://emailagent.cubegtp.com/
                            
                        '
                        """
                        sleep 5
                    }
                }
            }
        }
    }

    post {
        success {
            echo "✅ Deployment successful (clean code + clean images + CA bundle)"
        }

        failure {
            echo "❌ Deployment failed — check Jenkins logs"
        }
    }
}
