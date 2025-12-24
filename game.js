// Farcaster SDK - hata olursa oyun yine çalışsın
try {
    const { sdk } = await import('https://esm.sh/@farcaster/frame-sdk');
    sdk.actions.ready();
} catch (e) {
    console.log('Farcaster SDK yüklenemedi, oyun devam ediyor...');
}

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Canvas boyutu
const TILE_SIZE = 20;
const MAP_WIDTH = 15;
const MAP_HEIGHT = 15;
canvas.width = TILE_SIZE * MAP_WIDTH;
canvas.height = TILE_SIZE * MAP_HEIGHT;

// Oyun durumu
let gameRunning = false;
let score = 0;
let wave = 1;
let lives = 3;
let player = null;
let enemies = [];
let bullets = [];
let base = null;
let walls = [];

// Harita blok tipleri
const BLOCK_TYPES = {
    EMPTY: 0,
    BRICK: 1,
    STEEL: 2,
    WATER: 3,
    BASE: 4
};

// Harita şablonu
const MAP_TEMPLATE = [
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,1,1,0,2,0,0,1,0,0,2,0,1,1,0],
    [0,1,0,0,0,0,0,1,0,0,0,0,0,1,0],
    [0,0,0,1,1,0,3,3,3,0,1,1,0,0,0],
    [0,2,0,1,0,0,0,0,0,0,0,1,0,2,0],
    [0,0,0,0,0,1,0,0,0,1,0,0,0,0,0],
    [0,1,0,0,0,1,0,2,0,1,0,0,0,1,0],
    [0,1,3,0,0,0,0,0,0,0,0,0,3,1,0],
    [0,0,0,0,1,0,0,0,0,0,1,0,0,0,0],
    [0,2,0,0,1,0,0,0,0,0,1,0,0,2,0],
    [0,0,0,0,0,0,1,1,1,0,0,0,0,0,0],
    [0,1,0,1,0,0,0,0,0,0,0,1,0,1,0],
    [0,1,0,1,0,0,1,1,1,0,0,1,0,1,0],
    [0,0,0,0,0,0,1,4,1,0,0,0,0,0,0],
    [0,0,0,0,0,0,1,1,1,0,0,0,0,0,0]
];

// Tank sınıfı
class Tank {
    constructor(x, y, direction, isPlayer = false) {
        this.x = x;
        this.y = y;
        this.direction = direction;
        this.isPlayer = isPlayer;
        this.speed = isPlayer ? 2 : 1;
        this.lastShot = 0;
        this.shootCooldown = isPlayer ? 300 : 1500;
        this.width = TILE_SIZE - 4;
        this.height = TILE_SIZE - 4;
    }

    draw() {
        ctx.save();
        ctx.translate(this.x + this.width / 2, this.y + this.height / 2);
        
        const rotations = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 };
        ctx.rotate(rotations[this.direction]);
        
        ctx.fillStyle = this.isPlayer ? '#0a0' : '#a00';
        ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
        
        ctx.fillStyle = this.isPlayer ? '#0f0' : '#f00';
        ctx.fillRect(-2, -this.height / 2 - 6, 4, 10);
        
        ctx.fillStyle = '#333';
        ctx.fillRect(-this.width / 2, -this.height / 2, 3, this.height);
        ctx.fillRect(this.width / 2 - 3, -this.height / 2, 3, this.height);
        
        ctx.restore();
    }

    move(dir) {
        const oldX = this.x;
        const oldY = this.y;
        
        this.direction = dir;
        
        switch(dir) {
            case 'up': this.y -= this.speed; break;
            case 'down': this.y += this.speed; break;
            case 'left': this.x -= this.speed; break;
            case 'right': this.x += this.speed; break;
        }
        
        this.x = Math.max(0, Math.min(canvas.width - this.width, this.x));
        this.y = Math.max(0, Math.min(canvas.height - this.height, this.y));
        
        if (this.checkWallCollision() || this.checkTankCollision()) {
            this.x = oldX;
            this.y = oldY;
        }
    }

    checkWallCollision() {
        for (let wall of walls) {
            if (wall.type === BLOCK_TYPES.WATER || wall.type === BLOCK_TYPES.STEEL || wall.type === BLOCK_TYPES.BRICK) {
                if (this.collidesWith(wall)) return true;
            }
        }
        if (base && this.collidesWith(base)) return true;
        return false;
    }

    checkTankCollision() {
        const tanks = this.isPlayer ? enemies : [player, ...enemies.filter(e => e !== this)];
        for (let tank of tanks) {
            if (tank && tank !== this && this.collidesWith(tank)) return true;
        }
        return false;
    }

    collidesWith(obj) {
        return this.x < obj.x + obj.width &&
               this.x + this.width > obj.x &&
               this.y < obj.y + obj.height &&
               this.y + this.height > obj.y;
    }

    shoot() {
        const now = Date.now();
        if (now - this.lastShot < this.shootCooldown) return;
        this.lastShot = now;
        
        let bx = this.x + this.width / 2 - 3;
        let by = this.y + this.height / 2 - 3;
        
        bullets.push(new Bullet(bx, by, this.direction, this.isPlayer));
    }
}

class Bullet {
    constructor(x, y, direction, isFromPlayer) {
        this.x = x;
        this.y = y;
        this.direction = direction;
        this.isFromPlayer = isFromPlayer;
        this.speed = 5;
        this.width = 6;
        this.height = 6;
        this.active = true;
    }

    update() {
        switch(this.direction) {
            case 'up': this.y -= this.speed; break;
            case 'down': this.y += this.speed; break;
            case 'left': this.x -= this.speed; break;
            case 'right': this.x += this.speed; break;
        }
        
        if (this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) {
            this.active = false;
        }
    }

    draw() {
        ctx.fillStyle = '#ff0';
        ctx.fillRect(this.x, this.y, this.width, this.height);
    }

    collidesWith(obj) {
        return this.x < obj.x + obj.width &&
               this.x + this.width > obj.x &&
               this.y < obj.y + obj.height &&
               this.y + this.height > obj.y;
    }
}

class Wall {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.width = TILE_SIZE;
        this.height = TILE_SIZE;
        this.type = type;
        this.health = type === BLOCK_TYPES.BRICK ? 2 : Infinity;
    }

    draw() {
        switch(this.type) {
            case BLOCK_TYPES.BRICK:
                ctx.fillStyle = '#a52';
                ctx.fillRect(this.x, this.y, this.width, this.height);
                ctx.strokeStyle = '#631';
                ctx.lineWidth = 1;
                for (let i = 0; i < 2; i++) {
                    for (let j = 0; j < 2; j++) {
                        ctx.strokeRect(this.x + j * 10, this.y + i * 10, 10, 10);
                    }
                }
                break;
            case BLOCK_TYPES.STEEL:
                ctx.fillStyle = '#888';
                ctx.fillRect(this.x, this.y, this.width, this.height);
                ctx.fillStyle = '#aaa';
                ctx.fillRect(this.x + 2, this.y + 2, 6, 6);
                ctx.fillRect(this.x + 12, this.y + 2, 6, 6);
                ctx.fillRect(this.x + 2, this.y + 12, 6, 6);
                ctx.fillRect(this.x + 12, this.y + 12, 6, 6);
                break;
            case BLOCK_TYPES.WATER:
                ctx.fillStyle = '#06f';
                ctx.fillRect(this.x, this.y, this.width, this.height);
                ctx.fillStyle = '#08f';
                for (let i = 0; i < 3; i++) {
                    ctx.fillRect(this.x + 2 + i * 6, this.y + 5, 4, 2);
                    ctx.fillRect(this.x + 4 + i * 6, this.y + 12, 4, 2);
                }
                break;
        }
    }
}

class Base {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = TILE_SIZE;
        this.height = TILE_SIZE;
        this.destroyed = false;
    }

    draw() {
        ctx.fillStyle = this.destroyed ? '#400' : '#00f';
        ctx.fillRect(this.x, this.y, this.width, this.height);
        
        if (!this.destroyed) {
            ctx.fillStyle = '#0af';
            ctx.fillRect(this.x + 4, this.y + 4, 12, 12);
            ctx.fillStyle = '#fff';
            ctx.fillRect(this.x + 7, this.y + 7, 6, 6);
        }
    }
}

function createMap() {
    walls = [];
    base = null;
    
    for (let y = 0; y < MAP_HEIGHT; y++) {
        for (let x = 0; x < MAP_WIDTH; x++) {
            const type = MAP_TEMPLATE[y][x];
            const px = x * TILE_SIZE;
            const py = y * TILE_SIZE;
            
            if (type === BLOCK_TYPES.BRICK || type === BLOCK_TYPES.STEEL || type === BLOCK_TYPES.WATER) {
                walls.push(new Wall(px, py, type));
            } else if (type === BLOCK_TYPES.BASE) {
                base = new Base(px, py);
            }
        }
    }
}

function spawnEnemies() {
    const spawnPoints = [
        { x: 0, y: 0 },
        { x: (MAP_WIDTH - 1) * TILE_SIZE, y: 0 },
        { x: Math.floor(MAP_WIDTH / 2) * TILE_SIZE, y: 0 }
    ];
    
    const count = Math.min(2 + wave, 5);
    
    for (let i = 0; i < count; i++) {
        const spawn = spawnPoints[i % spawnPoints.length];
        const enemy = new Tank(spawn.x + 2, spawn.y + 2, 'down', false);
        enemies.push(enemy);
    }
}

function updateEnemies() {
    for (let enemy of enemies) {
        if (Math.random() < 0.02) {
            const dirs = ['up', 'down', 'left', 'right'];
            enemy.direction = dirs[Math.floor(Math.random() * dirs.length)];
        }
        
        enemy.move(enemy.direction);
        
        if (Math.random() < 0.02) {
            enemy.shoot();
        }
    }
}

function checkCollisions() {
    for (let bullet of bullets) {
        if (!bullet.active) continue;
        
        for (let i = walls.length - 1; i >= 0; i--) {
            const wall = walls[i];
            if (wall.type === BLOCK_TYPES.WATER) continue;
            
            if (bullet.collidesWith(wall)) {
                bullet.active = false;
                if (wall.type === BLOCK_TYPES.BRICK) {
                    wall.health--;
                    if (wall.health <= 0) {
                        walls.splice(i, 1);
                    }
                }
                break;
            }
        }
        
        if (base && !base.destroyed && bullet.collidesWith(base)) {
            bullet.active = false;
            base.destroyed = true;
            gameOver();
            return;
        }
        
        if (bullet.isFromPlayer) {
            for (let i = enemies.length - 1; i >= 0; i--) {
                if (bullet.collidesWith(enemies[i])) {
                    bullet.active = false;
                    enemies.splice(i, 1);
                    score += 100;
                    updateHUD();
                    break;
                }
            }
        } else {
            if (player && bullet.collidesWith(player)) {
                bullet.active = false;
                lives--;
                updateHUD();
                
                if (lives <= 0) {
                    gameOver();
                    return;
                } else {
                    player.x = Math.floor(MAP_WIDTH / 2) * TILE_SIZE - 8;
                    player.y = (MAP_HEIGHT - 2) * TILE_SIZE;
                }
            }
        }
    }
    
    bullets = bullets.filter(b => b.active);
    
    if (enemies.length === 0) {
        wave++;
        updateHUD();
        spawnEnemies();
    }
}

function updateHUD() {
    document.getElementById('score').textContent = `SKOR: ${score}`;
    document.getElementById('wave').textContent = `DALGA: ${wave}`;
    document.getElementById('lives').textContent = `❤️ ${lives}`;
}

function gameOver() {
    gameRunning = false;
    document.getElementById('final-score').textContent = `SKOR: ${score}`;
    document.getElementById('game-over').classList.remove('hidden');
}

function gameLoop() {
    if (!gameRunning) return;
    
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    for (let wall of walls) {
        wall.draw();
    }
    
    if (base) base.draw();
    if (player) player.draw();
    
    updateEnemies();
    for (let enemy of enemies) {
        enemy.draw();
    }
    
    for (let bullet of bullets) {
        bullet.update();
        bullet.draw();
    }
    
    checkCollisions();
    
    requestAnimationFrame(gameLoop);
}

function startGame() {
    score = 0;
    wave = 1;
    lives = 3;
    bullets = [];
    enemies = [];
    
    createMap();
    
    player = new Tank(
        Math.floor(MAP_WIDTH / 2) * TILE_SIZE - 8,
        (MAP_HEIGHT - 2) * TILE_SIZE,
        'up',
        true
    );
    
    spawnEnemies();
    updateHUD();
    
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('game-over').classList.add('hidden');
    
    gameRunning = true;
    gameLoop();
}

// Klavye kontrolleri
let keys = {};

document.addEventListener('keydown', (e) => {
    keys[e.key] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
    }
});

document.addEventListener('keyup', (e) => {
    keys[e.key] = false;
});

setInterval(() => {
    if (!gameRunning || !player) return;
    
    if (keys['ArrowUp'] || keys['w'] || keys['W']) player.move('up');
    if (keys['ArrowDown'] || keys['s'] || keys['S']) player.move('down');
    if (keys['ArrowLeft'] || keys['a'] || keys['A']) player.move('left');
    if (keys['ArrowRight'] || keys['d'] || keys['D']) player.move('right');
    if (keys[' ']) player.shoot();
}, 16);

// Dokunmatik kontroller
function setupTouchControls() {
    const buttons = {
        'up': 'up',
        'down': 'down',
        'left': 'left',
        'right': 'right'
    };
    
    for (let [id, dir] of Object.entries(buttons)) {
        const btn = document.getElementById(id);
        if (!btn) continue;
        
        let interval = null;
        
        const start = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (player && gameRunning) player.move(dir);
            if (interval) clearInterval(interval);
            interval = setInterval(() => {
                if (player && gameRunning) player.move(dir);
            }, 50);
        };
        
        const end = (e) => {
            e.preventDefault();
            if (interval) {
                clearInterval(interval);
                interval = null;
            }
        };
        
        btn.addEventListener('touchstart', start, { passive: false });
        btn.addEventListener('touchend', end, { passive: false });
        btn.addEventListener('touchcancel', end, { passive: false });
        btn.addEventListener('mousedown', start);
        btn.addEventListener('mouseup', end);
        btn.addEventListener('mouseleave', end);
    }
    
    // Ateş butonu
    const fireBtn = document.getElementById('fire');
    if (fireBtn) {
        fireBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (player && gameRunning) player.shoot();
        }, { passive: false });
        
        fireBtn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            if (player && gameRunning) player.shoot();
        });
    }
}

// Başlat butonları
document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('restart-btn').addEventListener('click', startGame);

// Sayfa yüklendiğinde
setupTouchControls();
