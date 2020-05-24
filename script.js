d3.select().__proto__.attrs = function(obj) { Object.keys(obj).forEach(k => this.attr(k.split(/(?=[A-Z])/).join('-').toLowerCase(), obj[k])); return this; };
const getColor = i => d3.interpolateRainbow(i);
const getId = s => s+'-'+`${Math.random()}`.substr(2);
const $ = (...args) => document.querySelector(...args);

const vscale = 1;
const screenSize = 500;

class Node {
    role = 0;
    id = 0;
    x = 0;
    y = 0;
    r = 0;

    porposal = 0;
    number = 0;
    state = 'INIT';

    acceptors = [];

    constructor(role, id, x, y, r, color, proposalColor) {
        this.role = role;
        this.id = id;
        this.x = x;
        this.y = y;
        this.r = r;
        this.color = color;
        this.proposalColor = proposalColor;
    }

    attrs() {
        return {
            r: this.r,
            cx: this.x,
            cy: this.y,
            id: this.id,
            fill: this.proposalColor,
            stroke: this.color,
            strokeWidth: this.r / 3
        }
    }

    async judgeNumber(b) {
        const a = this;
        if (a.number < b.number) {
            if (a.state !== 'STAGE2') {
                // already accept a proposal
                a.state = 'STAGE1';
                a.number = b.number;
                a.color = b.color;
                await transmit(Node.TYPE_NUMBER, a, b, 6);
            } else {
                // tell the node the propsal is already made
                await transmit(Node.TYPE_PROPOSAL, a, b, 6);
                if (b.number >= a.number) {
                    b.proposal = a.proposal;
                    b.proposalColor = a.proposalColor;
                }
            }
            return true;
        }
        return false;
    }

    async judgeProposal(b) {
        const a = this;
        if (a.number == b.number && a.state !== 'STAGE2') {
            a.state = 'STAGE2';
            a.proposal = b.proposal;
            a.proposalColor = b.proposalColor;
            return true;
        }
        return false;
    }

}

Node.ACCEPTOR = 0;
Node.PROPOSER = 1;
Node.LEARNER = 2;

Node.TYPE_NUMBER = 0;
Node.TYPE_PROPOSAL = 1;

let allNodes = [];
const svg = d3.select($('#container'))
    .append('svg')
    .attr('viewBox', [0, 0, screenSize * vscale, screenSize * vscale]);

const generateNodes = (role, n, sizeRate, radiusRate, colorFn, propColorFn) => {
    const r = screenSize * sizeRate;
    const radius = 2 * r * Math.PI / n / 5 * radiusRate;
    const nodes = [];
    for (let i = 0; i < n; i++) {
        const angle = i / n * 2 * Math.PI;
        const node = new Node(
            role,
            `${role}-${i}`,
            screenSize / 2 + r * Math.sin(angle),
            screenSize / 2 - r * Math.cos(angle),
            radius,
            colorFn.call ? colorFn(i) : colorFn,
            propColorFn.call ? propColorFn(i) : propColorFn
        );
        nodes.push(node);
        allNodes.push(node)
    }
    return nodes;
}

const transmit = (type, n1, n2, radius, duration=-1) => {
    if (duration < 0) duration = 1000 + Math.floor(Math.random() * 4000);
    return new Promise(rsv => {
        const g = svg.append('g');
        g.append('circle').attrs({
            r: radius,
            strokeWidth: radius / 2,
            id: getId('animate'),
            ...(
                type === Node.TYPE_NUMBER
                ? {
                    stroke: n1.color,
                    fill: 'transparent',
                } : {
                    stroke: n1.color,
                    fill: n1.proposalColor,
                }
            )
        });
        g.attr('transform', 'translate(' + n1.x + ', ' + n1.y + ')');
        g.transition()
            .duration(duration)
            .attr('transform', 'translate(' + n2.x + ', ' + n2.y + ')')
            .on('end', function() {
                g.remove();
                rsv(arguments[2]);
            });
    });
}

const startViz = (nOfAcceptors, nOfProposers, callback) => {

    let loopCount = 0;

    allNodes = [];
    svg.selectAll('*').remove();

    const acceptors = generateNodes(Node.ACCEPTOR, nOfAcceptors, 0.4, 1, '#000', '#888');
    const proposers = generateNodes(Node.PROPOSER, nOfProposers, 0.1, 0.5, i => getColor((nOfProposers-i-1) / nOfProposers), i => getColor((i+1) / 2 / nOfProposers));

    const group = svg.append('g');
    const circles = group.selectAll('circle')
        .data(allNodes)
        .join('circle');

    const updateCircles = () => circles.each(function(n) { d3.select(this).attrs(n.attrs()) });

    const doPropose = async (p, a) => {
        await transmit(Node.TYPE_PROPOSAL, p, a, 6);
        await a.judgeProposal(p);
    }

    const looper = setInterval(async () => {

        loopCount += 1;
        proposers.forEach(p => {
            switch (p.state) {
                case 'INIT':
                    // randomly wake up and propose a number
                    if ((p.id !== '1-0' && Math.random() < .05) || (p.id === '1-0' && loopCount > 100 && (p.number = 100000))) {
                    // if (Math.random() < .05) {
                        p.acceptors = [];
                        p.number = p.number || Math.floor(Math.random() * 1000);
                        acceptors.forEach(async a => {
                            await transmit(Node.TYPE_NUMBER, p, a, 6);
                            const success = await a.judgeNumber(p);
                            if (success) {
                                // console.log(a.id, 'accept', p.id, 'as', p.number);
                                p.acceptors.push(a);
                                if (p.state === 'STAGE2') await doPropose(p, a);
                            }
                        });
                        p.state = 'STAGE1';
                    }
                    break;
                case 'STAGE1':
                    // above half, start submitting propsal
                    if (p.acceptors.length > nOfAcceptors / 2) {
                        p.acceptors.forEach(async a => {
                            await doPropose(p, a);
                        });
                        p.state = 'STAGE2';
                        callback();
                    }
                    break;
                case 'STAGE2':
                    break;
            }
        })

        updateCircles();

    }, 100);

    return looper;

}

let intvId = 0;
$('#nos').addEventListener('click', () => {
    $('#nos').disabled = true;
    if (intvId) clearInterval(intvId);
    const nOfAcceptors = parseInt($('#noa').value, 10) || 20;
    const nOfProposers = parseInt($('#nop').value, 10) || 5;
    intvId = startViz(nOfAcceptors, nOfProposers, () => {
        $('#nos').disabled = false;
    });
})
