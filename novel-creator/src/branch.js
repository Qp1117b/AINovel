    // ║  模块 10：分支系统辅助函数                                        ║
    // ║  extractImageIds / extractOtherFileIds / extractAudioIds / collectDescendants / buildTreeMaps / getBranchPath║
    // ╚══════════════════════════════════════════════════════════════════╝

    /** @module BranchSystem — collectDescendants / buildTreeMaps / getBranchPath */

    // ==================== 分支系统辅助函数 ====================

    /**
     * 从章节内容中提取所有图片 ID
     * @param {string} content - 章节内容
     * @returns {Array<string>} 图片 ID 数组
     */
    function extractImageIds(content) {

        const ids = new Set();
        const regex = /id:([a-zA-Z0-9_]+)/g;
        let match;
        while ((match = regex.exec(content))) {
            ids.add(match[1]);
        }
        const result = Array.from(ids);

        return result;
    }

    /**
     * 从章节内容中提取所有其余文件 ID
     * @param {string} content - 章节内容
     * @returns {Array<string>} 其余文件 ID 数组
     */
    function extractOtherFileIds(content) {


        const ids = new Set();
        const regex = /id:(other_[a-zA-Z0-9_]+)/g;
        let match;
        let count = 0;
        while ((match = regex.exec(content))) {
            ids.add(match[1]);
            count++;

        }
        const result = Array.from(ids);

        return result;
    }

    /**
     * 从章节内容中提取所有音频 ID
     * @param {string} content - 章节内容
     * @returns {Array<string>} 音频 ID 数组
     */
    function extractAudioIds(content) {

        const ids = new Set();
        const regex = /id:(audio_[a-zA-Z0-9_]+)/g;
        let match;
        while ((match = regex.exec(content))) {
            ids.add(match[1]);
        }
        const result = Array.from(ids);

        return result;
    }

    /**
     * 收集某个节点的所有后代章节号（可选项包含自身）
     * @param {number} startNum - 起始章节号
     * @param {Array} chapters - 所有章节数组
     * @param {boolean} includeSelf - 是否包含自身
     * @returns {Array<number>} 后代章节号数组
     */
    function collectDescendants(startNum, chapters, includeSelf = false) {

        const result = [];
        const stack = [startNum];
        const visited = new Set();
        while (stack.length) {
            const current = stack.pop();
            if (visited.has(current)) continue;
            visited.add(current);
            if (current !== startNum || includeSelf) result.push(current);
            chapters.filter(c => c.parent === current).forEach(child => stack.push(child.num));
        }

        return result;
    }

    /**
     * 构建子节点映射和章节映射（用于树形渲染）
     * @param {Array} chapters - 所有章节数组
     * @returns {Object} { childrenMap, chapterMap }
     */
    function buildTreeMaps(chapters) {

        const childrenMap = {};
        const chapterMap = {};
        chapters.forEach(ch => {
            chapterMap[ch.num] = ch;
            childrenMap[ch.num] = [];
        });
        chapters.forEach(ch => {
            if (ch.parent && childrenMap[ch.parent]) {
                childrenMap[ch.parent].push(ch);
            }
        });
        // 按 num 排序子节点
        Object.values(childrenMap).forEach(list => list.sort((a, b) => a.num - b.num));

        return { childrenMap, chapterMap };
    }

    /**
     * 从当前章节向上回溯，构建紧凑分支路径
     * 规则：根节点号 + 每一级的 '#'.repeat(选择序号) + 选择序号
     * @param {number} num - 当前章节号
     * @param {Object} chapterMap - 章节映射 { num: chapter }
     * @param {Object} childrenMap - 子节点映射 { parentNum: [childChapter, ...] }（已按 num 排序）
     * @returns {string} 紧凑路径
     */
    function getBranchPath(num, chapterMap, childrenMap) {

        console.time(`getBranchPath_${num}`);

        const chapter = chapterMap[num];
        if (!chapter) {
            console.warn(`[getBranchPath] 章节 ${num} 不存在，返回默认值 ${num}`);
            console.timeEnd(`getBranchPath_${num}`);
            return String(num);
        }

        // 向上回溯，收集每一步的选择序号（从根到当前节点的顺序，但回溯得到的是反向）
        const segments = [];  // 从目标节点到根的方向
        let currentNum = num;
        let current = chapter;


        while (current.parent !== null && current.parent !== undefined) {
            const parentNum = current.parent;
            const parent = chapterMap[parentNum];
            if (!parent) {
                console.warn(`[getBranchPath] 父节点 ${parentNum} 不存在，终止回溯`);
                break;
            }

            // 获取父节点的子节点列表（已排序）
            const siblings = childrenMap[parentNum] || [];
            if (!siblings.length) {
                console.warn(`[getBranchPath] 父节点 ${parentNum} 的子节点列表为空，无法确定序号，终止回溯`);
                break;
            }

            // 查找当前节点在兄弟中的索引（从1开始）
            const index = siblings.findIndex(c => c.num === currentNum) + 1;
            if (index === 0) {
                console.warn(`[getBranchPath] 在父节点 ${parentNum} 的子节点中未找到当前节点 ${currentNum}，异常终止`);
                break;
            }


            segments.push(index);

            // 向上移动
            currentNum = parentNum;
            current = parent;

        }

        // 当前节点已无父节点，即为根节点
        const rootNum = currentNum;


        // 将 segments 反转，得到从根到目标节点的顺序
        const pathSegments = segments.reverse();


        // 构建紧凑路径
        let path = String(rootNum);
        for (const idx of pathSegments) {
            path += '#'.repeat(idx) + idx;
        }


        console.timeEnd(`getBranchPath_${num}`);
        return path;
    }


    // ╔══════════════════════════════════════════════════════════════════╗