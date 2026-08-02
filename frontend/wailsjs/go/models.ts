export namespace health {
	
	export class Result {
	    id: number;
	    missing: string;
	
	    static createFrom(source: any = {}) {
	        return new Result(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.missing = source["missing"];
	    }
	}

}

export namespace main {
	
	export class DeleteFailure {
	    id: number;
	    title: string;
	    reason: string;
	
	    static createFrom(source: any = {}) {
	        return new DeleteFailure(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.reason = source["reason"];
	    }
	}
	export class DeleteResult {
	    deleted: number;
	    failed: DeleteFailure[];
	
	    static createFrom(source: any = {}) {
	        return new DeleteResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.deleted = source["deleted"];
	        this.failed = this.convertValues(source["failed"], DeleteFailure);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ImportFailure {
	    title: string;
	    reason: string;
	
	    static createFrom(source: any = {}) {
	        return new ImportFailure(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.title = source["title"];
	        this.reason = source["reason"];
	    }
	}
	export class ImportResult {
	    games: store.Game[];
	    failed: ImportFailure[];
	    refreshFailed: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ImportResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.games = this.convertValues(source["games"], store.Game);
	        this.failed = this.convertValues(source["failed"], ImportFailure);
	        this.refreshFailed = source["refreshFailed"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace scan {
	
	export class Detected {
	    title: string;
	    folderPath: string;
	    exePath: string;
	    sizeBytes: number;
	    tool: string;
	
	    static createFrom(source: any = {}) {
	        return new Detected(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.title = source["title"];
	        this.folderPath = source["folderPath"];
	        this.exePath = source["exePath"];
	        this.sizeBytes = source["sizeBytes"];
	        this.tool = source["tool"];
	    }
	}

}

export namespace store {
	
	export class Tag {
	    id: number;
	    name: string;
	    axis: string;
	    color: string;
	
	    static createFrom(source: any = {}) {
	        return new Tag(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.axis = source["axis"];
	        this.color = source["color"];
	    }
	}
	export class Game {
	    id: number;
	    title: string;
	    exePath: string;
	    folderPath: string;
	    sizeBytes: number;
	    favorite: boolean;
	    // Go type: time
	    addedAt: any;
	    coverPath: string;
	    tool: string;
	    tags: Tag[];
	    missing: string;
	
	    static createFrom(source: any = {}) {
	        return new Game(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.exePath = source["exePath"];
	        this.folderPath = source["folderPath"];
	        this.sizeBytes = source["sizeBytes"];
	        this.favorite = source["favorite"];
	        this.addedAt = this.convertValues(source["addedAt"], null);
	        this.coverPath = source["coverPath"];
	        this.tool = source["tool"];
	        this.tags = this.convertValues(source["tags"], Tag);
	        this.missing = source["missing"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class TagWithCount {
	    id: number;
	    name: string;
	    axis: string;
	    color: string;
	    count: number;
	
	    static createFrom(source: any = {}) {
	        return new TagWithCount(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.axis = source["axis"];
	        this.color = source["color"];
	        this.count = source["count"];
	    }
	}

}

